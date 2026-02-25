import React, { useState, useEffect } from 'react';
import { Calculator, Wallet, Percent, ShieldCheck, TrendingDown, Info, Save, History, Download, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';

// 2026 Asgari Ücret Verileri
const ASGARI_UCRET_BRUT = 33030;
const ASGARI_UCRET_SGK_ISCI = ASGARI_UCRET_BRUT * 0.14;
const ASGARI_UCRET_ISS_ISCI = ASGARI_UCRET_BRUT * 0.01;
const ASGARI_UCRET_GELIR_MATRAH = ASGARI_UCRET_BRUT - (ASGARI_UCRET_SGK_ISCI + ASGARI_UCRET_ISS_ISCI);
const ASGARI_UCRET_GELIR_VERGISI_ISTISNA = ASGARI_UCRET_GELIR_MATRAH * 0.15;
const ASGARI_UCRET_DAMGA_VERGISI_ISTISNA = ASGARI_UCRET_BRUT * 0.00759;
const ASGARI_UCRET_NET = 28075.50; // Onaylanan net tutar

function App() {
  const [activeTab, setActiveTab] = useState('isci'); // 'isci' | 'isveren' | 'kayitlar'
  const [brutMaas, setBrutMaas] = useState(40000);
  const [netMaasInput, setNetMaasInput] = useState(0);
  const [lastChanged, setLastChanged] = useState('brut'); // 'brut' | 'net'
  const [savedRecords, setSavedRecords] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [label, setLabel] = useState('');

  const [calculations, setCalculations] = useState({
    sgkIsci: 0,
    issIsci: 0,
    gelirVergisi: 0,
    damgaVergisi: 0,
    toplamKesinti: 0,
    netMaas: 0,
    sgkIsveren: 0,
    issIsveren: 0,
    toplamMaliyet: 0,
    vergiIstisnasi: 0
  });

  // Gross to Net Calculation Logic
  const calculateFromGross = (brut) => {
    const sgkIsci = brut * 0.14;
    const issIsci = brut * 0.01;
    const gelirMatrah = brut - (sgkIsci + issIsci);

    let hamGelirVergisi = gelirMatrah * 0.15;
    const gelirVergisiIstisnası = Math.min(hamGelirVergisi, ASGARI_UCRET_GELIR_VERGISI_ISTISNA);
    const finalGelirVergisi = Math.max(0, hamGelirVergisi - gelirVergisiIstisnası);

    let hamDamgaVergisi = brut * 0.00759;
    const damgaVergisiIstisnasi = Math.min(hamDamgaVergisi, ASGARI_UCRET_DAMGA_VERGISI_ISTISNA);
    const finalDamgaVergisi = Math.max(0, hamDamgaVergisi - damgaVergisiIstisnasi);

    const sgkIsveren = brut * 0.155;
    const issIsveren = brut * 0.02;

    const toplamKesinti = sgkIsci + issIsci + finalGelirVergisi + finalDamgaVergisi;
    const netMaas = brut - toplamKesinti;
    const toplamMaliyet = brut + sgkIsveren + issIsveren;

    return {
      sgkIsci, issIsci, gelirVergisi: finalGelirVergisi, damgaVergisi: finalDamgaVergisi,
      toplamKesinti, netMaas, sgkIsveren, issIsveren, toplamMaliyet,
      vergiIstisnasi: gelirVergisiIstisnası + damgaVergisiIstisnasi,
      brutMaas: brut
    };
  };

  // Net to Gross Calculation Logic (Inverse of 15% bracket)
  const calculateFromNet = (net) => {
    let calculatedBrut = 0;
    if (net <= ASGARI_UCRET_NET) {
      calculatedBrut = net / 0.85;
    } else {
      // G = (Net - (IT_Istisna + ST_Istisna)) / 0.71491
      calculatedBrut = (net - (ASGARI_UCRET_GELIR_VERGISI_ISTISNA + ASGARI_UCRET_DAMGA_VERGISI_ISTISNA)) / 0.71491;
    }
    return calculateFromGross(calculatedBrut);
  };

  useEffect(() => {
    let results;
    if (lastChanged === 'brut') {
      results = calculateFromGross(Number(brutMaas) || 0);
      setNetMaasInput(results.netMaas.toFixed(2));
    } else {
      results = calculateFromNet(Number(netMaasInput) || 0);
      setBrutMaas(results.brutMaas.toFixed(2));
    }
    setCalculations(results);
  }, [brutMaas, netMaasInput, lastChanged]);

  useEffect(() => {
    if (activeTab === 'kayitlar') {
      fetchRecords();
    }
  }, [activeTab]);

  const fetchRecords = async () => {
    setIsLoadingRecords(true);
    const { data, error } = await supabase
      .from('maas_kayitlari')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setSavedRecords(data);
    setIsLoadingRecords(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const record = {
      label: label || `Hesaplama - ${new Date().toLocaleDateString('tr-TR')}`,
      brut_maas: calculations.brutMaas,
      net_maas: calculations.netMaas,
      isveren_maliyeti: calculations.toplamMaliyet,
      sgk_isci: calculations.sgkIsci,
      iss_isci: calculations.issIsci,
      gelir_vergisi: calculations.gelirVergisi,
      damga_vergisi: calculations.damgaVergisi,
      sgk_isveren: calculations.sgkIsveren,
      iss_isveren: calculations.issIsveren,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('maas_kayitlari').insert([record]);

    if (error) {
      alert('Kaydedilirken bir hata oluştu: ' + error.message);
    } else {
      setLabel('');
      alert('Başarıyla kaydedildi!');
    }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    const { error } = await supabase.from('maas_kayitlari').delete().eq('id', id);
    if (!error) {
      setSavedRecords(savedRecords.filter(r => r.id !== id));
    }
  };

  const exportToExcel = () => {
    const worksheetData = savedRecords.map(r => ({
      'Etiket': r.label,
      'Brüt Maaş': r.brut_maas.toFixed(2),
      'Net Maaş': r.net_maas.toFixed(2),
      'İşveren Maliyeti': r.isveren_maliyeti.toFixed(2),
      'SGK İşçi': r.sgk_isci.toFixed(2),
      'İşsizlik İşçi': r.iss_isci.toFixed(2),
      'Gelir Vergisi': r.gelir_vergisi.toFixed(2),
      'Damga Vergisi': r.damga_vergisi.toFixed(2),
      'SGK İşveren': r.sgk_isveren.toFixed(2),
      'İşsizlik İşveren': r.iss_isveren.toFixed(2),
      'Tarih': new Date(r.created_at).toLocaleString('tr-TR')
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Maaş Kayıtları");
    XLSX.writeFile(workbook, "MaasPusula_Kayitlar.xlsx");
  };

  const handleBrutChange = (e) => {
    setLastChanged('brut');
    setBrutMaas(e.target.value);
  };

  const handleNetChange = (e) => {
    setLastChanged('net');
    setNetMaasInput(e.target.value);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-navy-900 text-white font-sans selection:bg-emerald-500/30 flex flex-col">
      <nav className="p-4 md:p-6 flex items-center justify-between max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500 p-1.5 md:p-2 rounded-xl shadow-lg shadow-emerald-500/20">
            <Calculator size={20} className="text-white md:w-6 md:h-6" />
          </div>
          <span className="text-lg md:text-xl font-bold tracking-tight">Maas Pusula</span>
        </div>
        <div className="text-navy-300 text-[10px] md:text-sm font-medium bg-navy-800 px-2 py-0.5 md:px-3 md:py-1 rounded-full border border-white/5">
          2026 Verileri
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 md:px-6 pb-24 space-y-4 md:space-y-6 flex-1 w-full">

        {/* Tab Switcher */}
        <div className="flex p-1 bg-navy-800/50 backdrop-blur-md rounded-2xl border border-white/5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('isci')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 whitespace-nowrap ${activeTab === 'isci' ? 'bg-emerald-500 text-white shadow-lg' : 'text-navy-400 hover:text-white'}`}
          >
            İşçi
          </button>
          <button
            onClick={() => setActiveTab('isveren')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 whitespace-nowrap ${activeTab === 'isveren' ? 'bg-emerald-500 text-white shadow-lg' : 'text-navy-400 hover:text-white'}`}
          >
            İşveren
          </button>
          <button
            onClick={() => setActiveTab('kayitlar')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'kayitlar' ? 'bg-emerald-500 text-white shadow-lg' : 'text-navy-400 hover:text-white'}`}
          >
            <History size={14} /> Kayıtlar
          </button>
        </div>

        {activeTab === 'kayitlar' ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center bg-navy-800/30 p-3 md:p-4 rounded-2xl border border-white/5">
              <h3 className="text-sm md:text-lg font-bold flex items-center gap-2">
                <History className="text-emerald-500" size={18} /> Kayıtlı Veriler
              </h3>
              {savedRecords.length > 0 && (
                <button
                  onClick={exportToExcel}
                  className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-xl text-[10px] md:text-sm font-bold transition-all shadow-lg shadow-emerald-500/10 shrink-0"
                >
                  <Download size={14} /> Excel
                </button>
              )}
            </div>

            {isLoadingRecords ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 size={32} className="animate-spin text-emerald-500" />
              </div>
            ) : savedRecords.length === 0 ? (
              <div className="text-center py-16 glass rounded-3xl space-y-4">
                <div className="bg-navy-800 w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center mx-auto">
                  <History className="text-navy-400" size={24} />
                </div>
                <p className="text-navy-400 text-xs md:text-sm px-4">Henüz kaydedilmiş bir hesaplama bulunmuyor.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedRecords.map(record => (
                  <div key={record.id} className="glass p-4 rounded-2xl group transition-all active:scale-[0.98]">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 pr-2">
                        <h4 className="font-bold text-sm md:text-lg mb-1 truncate">{record.label}</h4>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-navy-400 font-medium tracking-wide">
                          <span className="bg-navy-800 px-1.5 py-0.5 rounded">Net: {formatCurrency(record.net_maas)}</span>
                          <span className="bg-navy-800 px-1.5 py-0.5 rounded">Maliyet: {formatCurrency(record.isveren_maliyeti)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="text-navy-500 hover:text-rose-500 p-2 rounded-xl hover:bg-rose-500/10 transition-all shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-navy-400 uppercase tracking-widest flex items-center gap-2">
                  <Wallet size={12} /> Brüt Maaş
                </label>
                <div className="relative group">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={brutMaas}
                    onChange={handleBrutChange}
                    className="w-full bg-navy-800 border border-white/10 rounded-2xl p-3 md:p-4 text-xl md:text-2xl font-bold focus:border-emerald-500 focus:outline-none transition-all placeholder:text-navy-700"
                    placeholder="0.00"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-navy-400 font-bold">₺</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-navy-400 uppercase tracking-widest flex items-center gap-2">
                  <Wallet size={12} /> Net Maaş
                </label>
                <div className="relative group">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={netMaasInput}
                    onChange={handleNetChange}
                    className="w-full bg-navy-800 border border-white/10 rounded-2xl p-3 md:p-4 text-xl md:text-2xl font-bold focus:border-emerald-500 focus:outline-none transition-all placeholder:text-navy-700"
                    placeholder="0.00"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-navy-400 font-bold">₺</div>
                </div>
              </div>
            </div>

            <section className={`glass-emerald rounded-3xl p-6 md:p-8 text-center space-y-1 relative overflow-hidden transition-all duration-500 ${activeTab === 'isveren' ? 'border-emerald-500/50 shadow-2xl shadow-emerald-500/10' : ''}`}>
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 blur-3xl rounded-full"></div>

              <p className="text-emerald-400 font-bold tracking-[0.2em] text-[10px] md:text-xs uppercase">
                {activeTab === 'isci' ? 'Tahmini Net Maaşınız' : 'Toplam İşveren Maliyeti'}
              </p>

              <h2 className="text-3xl md:text-6xl font-black text-white tracking-tight break-words py-2 leading-none">
                {activeTab === 'isci' ? formatCurrency(calculations.netMaas) : formatCurrency(calculations.toplamMaliyet)}
              </h2>

              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                <div className="bg-navy-900/50 px-3 py-1.5 rounded-full border border-white/5 flex items-center gap-1.5 text-[10px] md:text-xs">
                  <TrendingDown size={12} className="text-orange-400" />
                  <span className="font-semibold text-navy-300">
                    {formatCurrency(calculations.toplamKesinti)}
                  </span>
                </div>
                {activeTab === 'isveren' && (
                  <div className="bg-navy-900/50 px-3 py-1.5 rounded-full border border-white/5 flex items-center gap-1.5 text-[10px] md:text-xs">
                    <Percent size={12} className="text-sky-400" />
                    <span className="font-semibold text-navy-300">
                      Yük: {formatCurrency(calculations.sgkIsveren + calculations.issIsveren)}
                    </span>
                  </div>
                )}
              </div>
            </section>

            <div className="flex gap-2">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Bu hesaba bir ad ver..."
                className="flex-1 bg-navy-800 border border-white/10 rounded-xl md:rounded-2xl px-3 md:px-4 py-3 focus:border-emerald-500 focus:outline-none transition-all text-xs"
              />
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-emerald-500 active:bg-emerald-600 disabled:bg-emerald-800 px-4 md:px-6 py-3 rounded-xl md:rounded-2xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 text-xs md:text-sm shrink-0"
              >
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                <span>Kaydet</span>
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <InfoCard title="SGK İşçi" value={calculations.sgkIsci} icon={<ShieldCheck className="text-blue-400" />} />
              <InfoCard title="İşsizlik" value={calculations.issIsci} icon={<Percent className="text-indigo-400" />} />
              <InfoCard title="Gelir Ver." value={calculations.gelirVergisi} icon={<TrendingDown className="text-orange-400" />} />
              <InfoCard title="Damga Ver." value={calculations.damgaVergisi} icon={<TrendingDown className="text-rose-400" />} />

              {activeTab === 'isveren' && (
                <>
                  <InfoCard title="SGK İşv." value={calculations.sgkIsveren} icon={<ShieldCheck className="text-emerald-400" />} />
                  <InfoCard title="İşs. İşv." value={calculations.issIsveren} icon={<Percent className="text-sky-400" />} />
                </>
              )}
            </div>

            {activeTab === 'isveren' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="glass p-3 rounded-2xl border-l-2 border-l-emerald-500">
                  <h4 className="text-navy-400 text-[10px] font-bold uppercase mb-1">Çalışan Net</h4>
                  <p className="text-sm md:text-xl font-black">{formatCurrency(calculations.netMaas)}</p>
                </div>
                <div className="glass p-3 rounded-2xl border-l-2 border-l-sky-500">
                  <h4 className="text-navy-400 text-[10px] font-bold uppercase mb-1">Brüt</h4>
                  <p className="text-sm md:text-xl font-black">{formatCurrency(calculations.brutMaas)}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <section className="glass rounded-2xl p-4 flex gap-3 items-center">
          <div className="bg-emerald-500/10 p-2 rounded-lg shrink-0">
            <Info className="text-emerald-500" size={16} />
          </div>
          <p className="text-[10px] md:text-xs text-navy-300 leading-tight">
            2026 asgari ücret <span className="text-white font-medium">{formatCurrency(ASGARI_UCRET_BRUT)}</span> üzerinden vergi istisnaları dahil edilmiştir.
          </p>
        </section>

      </main>

      <footer className="p-6 text-center text-[10px] text-navy-500 uppercase tracking-[0.2em] font-bold mt-auto">
        Maaş Pusula • {new Date().getFullYear()}
      </footer>
    </div>
  );
}



function InfoCard({ title, value, icon }) {
  const formatValue = (v) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY'
    }).format(v);
  };

  return (
    <div className="glass p-5 rounded-2xl hover:scale-[1.02] transition-transform duration-300">
      <div className="flex justify-between items-start mb-3">
        <div className="p-2 bg-white/5 rounded-xl">
          {icon}
        </div>
      </div>
      <div>
        <h3 className="text-navy-300 text-xs font-bold uppercase tracking-wider mb-1">{title}</h3>
        <p className="text-2xl font-bold">{formatValue(value)}</p>
      </div>
    </div>
  );
}

export default App;
