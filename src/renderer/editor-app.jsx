/* ================================================================
   Editor Tariffario BCB
   ================================================================
   Modifica visualmente il tariffario JSON usato dal Preventivatore.
   Ogni cambiamento è in memoria finché l'utente non clicca "Salva tutto".
   ================================================================ */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';

/* ============== Palette e stili ================================= */
const C = {
  navy:     '#1d3a5f',
  beige:    '#b3a082',
  bg:       '#f8f7f4',
  card:     '#ffffff',
  border:   '#e5e1d8',
  text:     '#2a2a2a',
  muted:    '#6b6560',
  accent:   '#1d3a5f',
  warn:     '#b45309',
  warnBg:   '#fef3c7',
  err:      '#991b1b',
  errBg:    '#fef2f2',
  ok:       '#15803d',
  okBg:     '#dcfce7',
  light:    '#f3efea',
  shadow:   'rgba(29, 58, 95, 0.12)',
  custom:   '#7c3aed',  // viola per voci custom
  customBg: '#f3e8ff',
};

const S = {
  page: {
    background: C.bg, color: C.text, minHeight: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    background: C.card, borderBottom: `1px solid ${C.border}`,
    padding: '14px 22px', position: 'sticky', top: 0, zIndex: 10,
    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
  },
  container: { maxWidth: 1100, margin: '0 auto', padding: '20px 22px 40px' },
  card: {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
    marginBottom: 14, overflow: 'hidden',
  },
  cardHeader: {
    padding: '14px 18px', cursor: 'pointer', userSelect: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: C.card, transition: 'background 0.15s',
  },
  cardBody: { padding: '18px 22px', borderTop: `1px solid ${C.border}` },
  h2: { margin: 0, fontSize: 16, color: C.navy, fontWeight: 600 },
  h3: { margin: '0 0 10px', fontSize: 14, color: C.navy, fontWeight: 600 },
  subgroup: {
    background: C.light, borderRadius: 8, padding: '14px 16px',
    marginBottom: 12, border: `1px solid ${C.border}`,
  },
  inp: {
    border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px',
    fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.card,
    outline: 'none', width: 100, textAlign: 'right',
  },
  inpText: {
    border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px',
    fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.card,
    outline: 'none',
  },
  lbl: { fontSize: 12, color: C.muted, display: 'block', marginBottom: 3 },
  btn: {
    padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', border: 'none',
    transition: 'all 0.15s',
  },
  btnPrimary: { background: C.navy, color: 'white' },
  btnGhost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}` },
  btnDanger: { background: 'transparent', color: C.err, border: `1px solid ${C.err}` },
  table: { width: '100%', fontSize: 13, borderCollapse: 'collapse' },
  td: { padding: '8px 10px', borderBottom: `1px solid ${C.border}` },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    fontSize: 11, fontWeight: 600, marginLeft: 8,
  },
};

/* ============== Utility ========================================= */
const eur = (n) => isNaN(n) || n == null ? '—' :
  n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmtNum = (n) => isNaN(n) || n == null ? '' : String(n);

const parseFloat2 = (s) => {
  if (s === '' || s == null) return 0;
  const v = parseFloat(String(s).replace(',', '.'));
  return isNaN(v) ? 0 : v;
};

const parsePerc = (s) => {
  // Riceve un input "0,15" e restituisce 0.0015 (cioè diviso 100)
  const v = parseFloat2(s);
  return v / 100;
};

const aliquotaToPerc = (a) => {
  // 0.0015 → "0,15"
  if (a == null || isNaN(a)) return '';
  return (a * 100).toLocaleString('it-IT', { maximumFractionDigits: 6 });
};

const fmtTimestamp = (iso) => {
  if (!iso) return 'mai';
  try {
    const d = new Date(iso);
    return d.toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

// Hash semplice per generare ID unici per voci nuove
const newId = (prefix = 'custom') =>
  `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000)}`;

/* ============== Componenti riusabili ============================ */

// Card a fisarmonica
function Section({ title, subtitle, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={S.card}>
      <div
        style={S.cardHeader}
        onClick={() => setOpen(!open)}
        onMouseEnter={(e) => e.currentTarget.style.background = C.light}
        onMouseLeave={(e) => e.currentTarget.style.background = C.card}
      >
        <div>
          <h2 style={S.h2}>
            {title}
            {count != null && (
              <span style={{ ...S.badge, background: C.light, color: C.muted }}>
                {count} voci
              </span>
            )}
          </h2>
          {subtitle && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              {subtitle}
            </div>
          )}
        </div>
        <div style={{ fontSize: 14, color: C.muted, transform: open ? 'rotate(90deg)' : '', transition: 'transform 0.2s' }}>
          ▶
        </div>
      </div>
      {open && <div style={S.cardBody}>{children}</div>}
    </div>
  );
}

// Campo numerico con label sopra
function NumField({ label, value, onChange, suffix = '€', width = 110, decimals = 2, step = 'any', placeholder = '' }) {
  return (
    <div style={{ display: 'inline-block', marginRight: 12 }}>
      {label && <label style={S.lbl}>{label}</label>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          step={step}
          value={value === '' || value == null ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...S.inp, width }}
        />
        {suffix && <span style={{ fontSize: 12, color: C.muted }}>{suffix}</span>}
      </div>
    </div>
  );
}

// Campo testo
function TextField({ label, value, onChange, placeholder = '', width = 220 }) {
  return (
    <div style={{ display: 'inline-block', marginRight: 12 }}>
      {label && <label style={S.lbl}>{label}</label>}
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...S.inpText, width }}
      />
    </div>
  );
}

// Bottone
function Btn({ children, onClick, variant = 'primary', size = 'normal', disabled = false }) {
  const variants = {
    primary: S.btnPrimary,
    ghost:   S.btnGhost,
    danger:  S.btnDanger,
  };
  const sizes = size === 'small' ? { padding: '5px 10px', fontSize: 12 } : {};
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...S.btn, ...variants[variant], ...sizes,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/* ============== Sezione: CONTABILITÀ ============================ */
function SectionContabilita({ data, update }) {
  const upd = (path, val) => update(['contabilita', ...path], val);

  const aggiungiFasciaSemplificata = () => {
    const fasce = [...data.contabilita.semplificata.fasce];
    const last = fasce[fasce.length - 1];
    fasce.push({ max: (last?.max || 0) + 100, val: 0, etichetta: 'Nuova fascia' });
    upd(['semplificata', 'fasce'], fasce);
  };

  const rimuoviFasciaSemplificata = (i) => {
    if (data.contabilita.semplificata.fasce.length <= 1) {
      alert('Deve restare almeno una fascia');
      return;
    }
    const fasce = data.contabilita.semplificata.fasce.filter((_, idx) => idx !== i);
    upd(['semplificata', 'fasce'], fasce);
  };

  const aggiungiFasciaOrdinaria = () => {
    const fasce = [...data.contabilita.ordinaria.fasce];
    const last = fasce[fasce.length - 1];
    fasce.push({ max: (last?.max || 0) + 100, val: 0, etichetta: 'Nuova fascia' });
    upd(['ordinaria', 'fasce'], fasce);
  };

  const rimuoviFasciaOrdinaria = (i) => {
    if (data.contabilita.ordinaria.fasce.length <= 1) {
      alert('Deve restare almeno una fascia');
      return;
    }
    const fasce = data.contabilita.ordinaria.fasce.filter((_, idx) => idx !== i);
    upd(['ordinaria', 'fasce'], fasce);
  };

  const aggiungiVoceExtra = () => {
    const extra = [...(data.contabilita.extra || [])];
    extra.push({ id: newId('cont'), nome: 'Nuovo servizio', tariffa: 0, unita: 'fisso annuo' });
    upd(['extra'], extra);
  };

  const rimuoviVoceExtra = (id) => {
    if (!confirm('Rimuovere questa voce extra dal tariffario?')) return;
    const extra = (data.contabilita.extra || []).filter(v => v.id !== id);
    upd(['extra'], extra);
  };

  const updateVoceExtra = (id, field, value) => {
    const extra = (data.contabilita.extra || []).map(v =>
      v.id === id ? { ...v, [field]: value } : v
    );
    upd(['extra'], extra);
  };

  return (
    <Section
      title="📒 Contabilità"
      subtitle="Forfettaria, Semplificata, Ordinaria + servizi contabili extra"
      defaultOpen={false}
    >
      {/* Forfettaria */}
      <div style={S.subgroup}>
        <h3 style={S.h3}>Regime Forfettario</h3>
        <NumField
          label="Tariffa annua fissa"
          value={data.contabilita.forfettaria.tariffa}
          onChange={(v) => upd(['forfettaria', 'tariffa'], parseFloat2(v))}
          width={130}
        />
      </div>

      {/* Semplificata */}
      <div style={S.subgroup}>
        <h3 style={S.h3}>Regime Semplificato</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
          {data.contabilita.semplificata.etichetta}
        </p>
        <table style={S.table}>
          <thead>
            <tr style={{ background: C.card }}>
              <th style={{ ...S.td, textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600 }}>Fascia (fino a N documenti)</th>
              <th style={{ ...S.td, textAlign: 'right', fontSize: 11, color: C.muted, fontWeight: 600 }}>Tariffa annua</th>
              <th style={{ ...S.td, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.contabilita.semplificata.fasce.map((f, i) => (
              <tr key={i}>
                <td style={S.td}>
                  Fino a{' '}
                  <input type="number" value={f.max}
                    onChange={(e) => {
                      const fasce = [...data.contabilita.semplificata.fasce];
                      fasce[i] = { ...f, max: parseFloat2(e.target.value) };
                      upd(['semplificata', 'fasce'], fasce);
                    }}
                    style={{ ...S.inp, width: 80 }}/>
                  {' '}documenti annui
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <input type="number" value={f.val} step="0.01"
                    onChange={(e) => {
                      const fasce = [...data.contabilita.semplificata.fasce];
                      fasce[i] = { ...f, val: parseFloat2(e.target.value) };
                      upd(['semplificata', 'fasce'], fasce);
                    }}
                    style={{ ...S.inp, width: 110 }}/>
                  {' €'}
                </td>
                <td style={S.td}>
                  <Btn variant="danger" size="small" onClick={() => rimuoviFasciaSemplificata(i)}>×</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <Btn variant="ghost" size="small" onClick={aggiungiFasciaSemplificata}>+ Aggiungi fascia</Btn>
        </div>
        <NumField
          label="Per ogni 100 documenti aggiuntivi (oltre l'ultima fascia)"
          value={data.contabilita.semplificata.extraPer100}
          onChange={(v) => upd(['semplificata', 'extraPer100'], parseFloat2(v))}
        />
      </div>

      {/* Ordinaria */}
      <div style={S.subgroup}>
        <h3 style={S.h3}>Regime Ordinario</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
          {data.contabilita.ordinaria.etichetta}
        </p>
        <table style={S.table}>
          <thead>
            <tr style={{ background: C.card }}>
              <th style={{ ...S.td, textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600 }}>Fascia (fino a N rilevazioni)</th>
              <th style={{ ...S.td, textAlign: 'right', fontSize: 11, color: C.muted, fontWeight: 600 }}>Tariffa annua</th>
              <th style={{ ...S.td, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.contabilita.ordinaria.fasce.map((f, i) => (
              <tr key={i}>
                <td style={S.td}>
                  Fino a{' '}
                  <input type="number" value={f.max}
                    onChange={(e) => {
                      const fasce = [...data.contabilita.ordinaria.fasce];
                      fasce[i] = { ...f, max: parseFloat2(e.target.value) };
                      upd(['ordinaria', 'fasce'], fasce);
                    }}
                    style={{ ...S.inp, width: 80 }}/>
                  {' '}rilevazioni
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <input type="number" value={f.val} step="0.01"
                    onChange={(e) => {
                      const fasce = [...data.contabilita.ordinaria.fasce];
                      fasce[i] = { ...f, val: parseFloat2(e.target.value) };
                      upd(['ordinaria', 'fasce'], fasce);
                    }}
                    style={{ ...S.inp, width: 110 }}/>
                  {' €'}
                </td>
                <td style={S.td}>
                  <Btn variant="danger" size="small" onClick={() => rimuoviFasciaOrdinaria(i)}>×</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <Btn variant="ghost" size="small" onClick={aggiungiFasciaOrdinaria}>+ Aggiungi fascia</Btn>
        </div>
        <NumField
          label="Per ogni 100 rilevazioni aggiuntive (oltre l'ultima fascia)"
          value={data.contabilita.ordinaria.extraPer100}
          onChange={(v) => upd(['ordinaria', 'extraPer100'], parseFloat2(v))}
        />
      </div>

      {/* Servizi Contabili Extra */}
      <div style={S.subgroup}>
        <h3 style={S.h3}>Servizi Contabili Extra</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
          Voci aggiuntive (foglio CONTABILITA dell'XLS originale, righe 25-42).
        </p>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.td, textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600, width: '50%' }}>Voce</th>
              <th style={{ ...S.td, textAlign: 'right', fontSize: 11, color: C.muted, fontWeight: 600 }}>Tariffa</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600 }}>Unità</th>
              <th style={{ ...S.td, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {(data.contabilita.extra || []).map((v) => (
              <tr key={v.id}>
                <td style={S.td}>
                  <input type="text" value={v.nome}
                    onChange={(e) => updateVoceExtra(v.id, 'nome', e.target.value)}
                    style={{ ...S.inpText, width: '100%' }}/>
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <input type="number" value={v.tariffa} step="0.01"
                    onChange={(e) => updateVoceExtra(v.id, 'tariffa', parseFloat2(e.target.value))}
                    style={{ ...S.inp, width: 100 }}/>
                  {' €'}
                </td>
                <td style={S.td}>
                  <input type="text" value={v.unita}
                    onChange={(e) => updateVoceExtra(v.id, 'unita', e.target.value)}
                    style={{ ...S.inpText, width: 130 }}/>
                </td>
                <td style={S.td}>
                  <Btn variant="danger" size="small" onClick={() => rimuoviVoceExtra(v.id)}>×</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <Btn variant="ghost" size="small" onClick={aggiungiVoceExtra}>+ Aggiungi servizio extra</Btn>
        </div>
      </div>
    </Section>
  );
}

/* ============== Sezione: DICHIARAZIONI ========================== */
function SectionDichiarazioni({ data, update }) {
  const upd = (path, val) => update(['dichiarazioni', ...path], val);

  const aggiungiVoceExtra = () => {
    const extra = [...(data.dichiarazioni.extra || [])];
    extra.push({ id: newId('dich'), nome: 'Nuova voce', tipo: 'fisso', tariffa: 0, unita: 'fisso' });
    upd(['extra'], extra);
  };

  const updateVoceExtra = (id, field, value) => {
    const extra = (data.dichiarazioni.extra || []).map(v =>
      v.id === id ? { ...v, [field]: value } : v
    );
    upd(['extra'], extra);
  };

  const rimuoviVoceExtra = (id) => {
    if (!confirm('Rimuovere questa voce extra dal tariffario?')) return;
    const extra = (data.dichiarazioni.extra || []).filter(v => v.id !== id);
    upd(['extra'], extra);
  };

  return (
    <Section
      title="📝 Dichiarazioni"
      subtitle="LIPE, IVA, CU, Modello 770, F24, Sistema TS + voci dichiarative extra"
      defaultOpen={false}
    >
      {/* Voci principali */}
      <div style={S.subgroup}>
        <h3 style={S.h3}>Voci principali</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <NumField label="LIPE (per singolo invio)" value={data.dichiarazioni.lipe.tariffa}
            onChange={(v) => upd(['lipe', 'tariffa'], parseFloat2(v))}/>
          <NumField label="Dichiarazione Annuale IVA (fisso)" value={data.dichiarazioni.dichIVA.tariffa}
            onChange={(v) => upd(['dichIVA', 'tariffa'], parseFloat2(v))}/>
          <NumField label="Sistema Tessera Sanitaria (fisso)" value={data.dichiarazioni.sistemats.tariffa}
            onChange={(v) => upd(['sistemats', 'tariffa'], parseFloat2(v))}/>
        </div>
      </div>

      {/* CU */}
      <div style={S.subgroup}>
        <h3 style={S.h3}>Certificazione Unica (CU)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <NumField label="CU contabilità interne (fisso)"
            value={data.dichiarazioni.cu.interne.tariffa}
            onChange={(v) => upd(['cu', 'interne', 'tariffa'], parseFloat2(v))}/>
          <NumField label="CU consulenze solo telematico (fisso)"
            value={data.dichiarazioni.cu.soloTel.tariffa}
            onChange={(v) => upd(['cu', 'soloTel', 'tariffa'], parseFloat2(v))}/>
          <NumField label="CU consulenze telematico+excel (base)"
            value={data.dichiarazioni.cu.telExcel.tariffa}
            onChange={(v) => upd(['cu', 'telExcel', 'tariffa'], parseFloat2(v))}/>
          <NumField label="CU - per ogni percipiente"
            value={data.dichiarazioni.cu.perPercipiente.tariffa}
            onChange={(v) => upd(['cu', 'perPercipiente', 'tariffa'], parseFloat2(v))}/>
        </div>
      </div>

      {/* Modello 770 */}
      <div style={S.subgroup}>
        <h3 style={S.h3}>Modello 770</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
          Il preventivatore usa la modalità "per rigo" come default. La modalità "fisso" è alternativa.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <NumField label="Modalità Fisso (alternativa)"
            value={data.dichiarazioni.m770.fisso.tariffa}
            onChange={(v) => upd(['m770', 'fisso', 'tariffa'], parseFloat2(v))}/>
          <NumField label="Base + righi: importo base"
            value={data.dichiarazioni.m770.base.tariffa}
            onChange={(v) => upd(['m770', 'base', 'tariffa'], parseFloat2(v))}/>
          <NumField label="Base + righi: per rigo"
            value={data.dichiarazioni.m770.perRigo.tariffa}
            onChange={(v) => upd(['m770', 'perRigo', 'tariffa'], parseFloat2(v))}/>
        </div>
      </div>

      {/* F24 */}
      <div style={S.subgroup}>
        <h3 style={S.h3}>Pagamento Modelli F24</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
          Il preventivatore usa la modalità "per delega" come default. La modalità "fisso" è alternativa.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <NumField label="Modalità Fisso (alternativa)"
            value={data.dichiarazioni.f24.fisso.tariffa}
            onChange={(v) => upd(['f24', 'fisso', 'tariffa'], parseFloat2(v))}/>
          <NumField label="Per ogni delega inviata"
            value={data.dichiarazioni.f24.perDelega.tariffa}
            onChange={(v) => upd(['f24', 'perDelega', 'tariffa'], parseFloat2(v))}/>
        </div>
      </div>

      {/* Voci Dichiarative Extra */}
      <div style={S.subgroup}>
        <h3 style={S.h3}>Servizi Dichiarativi Extra</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
          Modello IVA TR, ISA, Lettere d'intento, invio dichiarazioni, ecc.
        </p>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.td, textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600, width: '36%' }}>Voce</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600 }}>Tipo</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600, textAlign: 'right' }}>Valori</th>
              <th style={{ ...S.td, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {(data.dichiarazioni.extra || []).map((v) => (
              <tr key={v.id}>
                <td style={S.td}>
                  <input type="text" value={v.nome}
                    onChange={(e) => updateVoceExtra(v.id, 'nome', e.target.value)}
                    style={{ ...S.inpText, width: '100%' }}/>
                </td>
                <td style={S.td}>
                  <select value={v.tipo || 'fisso'}
                    onChange={(e) => updateVoceExtra(v.id, 'tipo', e.target.value)}
                    style={{ ...S.inpText, width: 110 }}>
                    <option value="fisso">Fisso</option>
                    <option value="perUnita">Per unità</option>
                    <option value="composta">Composta (base + per unità)</option>
                  </select>
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  {v.tipo === 'composta' ? (
                    <>
                      <NumField label="Base" value={v.base}
                        onChange={(x) => updateVoceExtra(v.id, 'base', parseFloat2(x))}
                        width={75}/>
                      <NumField label={v.etichettaUnita || 'per unità'} value={v.perUnita}
                        onChange={(x) => updateVoceExtra(v.id, 'perUnita', parseFloat2(x))}
                        width={70}/>
                      <TextField label="Etichetta unità" value={v.etichettaUnita}
                        onChange={(x) => updateVoceExtra(v.id, 'etichettaUnita', x)}
                        width={140}/>
                    </>
                  ) : (
                    <>
                      <input type="number" value={v.tariffa || 0} step="0.01"
                        onChange={(e) => updateVoceExtra(v.id, 'tariffa', parseFloat2(e.target.value))}
                        style={{ ...S.inp, width: 100 }}/>
                      {' € '}
                      <input type="text" value={v.unita || ''}
                        onChange={(e) => updateVoceExtra(v.id, 'unita', e.target.value)}
                        placeholder="unità (es. per invio)"
                        style={{ ...S.inpText, width: 130, marginLeft: 6 }}/>
                    </>
                  )}
                </td>
                <td style={S.td}>
                  <Btn variant="danger" size="small" onClick={() => rimuoviVoceExtra(v.id)}>×</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <Btn variant="ghost" size="small" onClick={aggiungiVoceExtra}>+ Aggiungi voce dichiarativa</Btn>
        </div>
      </div>
    </Section>
  );
}

/* ============== Sezione: QUADRI (UPF / USP / USC) =============== */
function SectionQuadri({ data, update }) {
  const aggiungiVoce = (quadro) => {
    const voci = [...(data.quadri[quadro].voci || [])];
    voci.push({
      id: newId('q'), codice: 'NUOVO', nome: 'Nuovo quadro',
      tariffa: 0, modalita: 'fisso',
    });
    update(['quadri', quadro, 'voci'], voci);
  };

  const aggiornaVoce = (quadro, id, field, value) => {
    const voci = data.quadri[quadro].voci.map(v =>
      v.id === id ? { ...v, [field]: value } : v
    );
    update(['quadri', quadro, 'voci'], voci);
  };

  const rimuoviVoce = (quadro, id) => {
    if (!confirm('Rimuovere questa voce di quadro dal tariffario?')) return;
    const voci = data.quadri[quadro].voci.filter(v => v.id !== id);
    update(['quadri', quadro, 'voci'], voci);
  };

  const renderQuadro = (key, titolo) => {
    const q = data.quadri[key];
    return (
      <div style={S.subgroup} key={key}>
        <h3 style={S.h3}>{titolo}</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
          {q.etichetta}
        </p>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.td, textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600, width: 70 }}>Codice</th>
              <th style={{ ...S.td, textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600 }}>Descrizione</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600 }}>Modalità</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600, textAlign: 'right' }}>Tariffa</th>
              <th style={{ ...S.td, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {q.voci.map((v) => (
              <tr key={v.id}>
                <td style={S.td}>
                  <input type="text" value={v.codice}
                    onChange={(e) => aggiornaVoce(key, v.id, 'codice', e.target.value)}
                    style={{ ...S.inpText, width: 60, fontWeight: 600, color: C.navy }}/>
                </td>
                <td style={S.td}>
                  <input type="text" value={v.nome}
                    onChange={(e) => aggiornaVoce(key, v.id, 'nome', e.target.value)}
                    style={{ ...S.inpText, width: '100%' }}/>
                </td>
                <td style={S.td}>
                  <select value={v.modalita}
                    onChange={(e) => aggiornaVoce(key, v.id, 'modalita', e.target.value)}
                    style={{ ...S.inpText, width: 120 }}>
                    <option value="fisso">Fisso</option>
                    <option value="perRiga">Per riga</option>
                    <option value="perSezione">Per sezione</option>
                  </select>
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <input type="number" value={v.tariffa} step="0.01"
                    onChange={(e) => aggiornaVoce(key, v.id, 'tariffa', parseFloat2(e.target.value))}
                    style={{ ...S.inp, width: 100 }}/>
                  {' €'}
                </td>
                <td style={S.td}>
                  <Btn variant="danger" size="small" onClick={() => rimuoviVoce(key, v.id)}>×</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <Btn variant="ghost" size="small" onClick={() => aggiungiVoce(key)}>+ Aggiungi quadro</Btn>
        </div>
      </div>
    );
  };

  return (
    <Section
      title="📋 Quadri Modelli Unici"
      subtitle="UPF (Persone Fisiche), USP (Soc. Persone), USC (Soc. Capitali)"
      defaultOpen={false}
    >
      {renderQuadro('upf', 'UPF — Modello Unico Persone Fisiche')}
      {renderQuadro('usp', 'USP — Modello Unico Società di Persone')}
      {renderQuadro('usc', 'USC — Modello Unico Società di Capitali')}
    </Section>
  );
}

/* ============== Sezione: BILANCIO =============================== */
function SectionBilancio({ data, update }) {
  const upd = (path, val) => update(['bilancio', ...path], val);

  const aggiornaStorico = (i, field, value) => {
    const sm = [...(data.bilancio.storicoMinimi || [])];
    sm[i] = { ...sm[i], [field]: value };
    upd(['storicoMinimi'], sm);
  };
  const aggiungiStorico = () => {
    const sm = [...(data.bilancio.storicoMinimi || [])];
    const lastAnno = sm.length > 0 ? Math.max(...sm.map(x => x.anno)) : 2025;
    sm.push({ anno: lastAnno + 1, minimo: 0 });
    upd(['storicoMinimi'], sm);
  };
  const rimuoviStorico = (i) => {
    upd(['storicoMinimi'], data.bilancio.storicoMinimi.filter((_, idx) => idx !== i));
  };

  return (
    <Section
      title="📊 Bilancio (SRL e altre soc. di capitali)"
      subtitle="Tariffa minima annua e storico"
      defaultOpen={false}
    >
      {/* Nota informativa: aliquote NON modificabili (fissate per legge) */}
      <div style={{
        background: '#fef3c7', border: `1px solid ${C.warn}`, borderRadius: 8,
        padding: '12px 16px', marginBottom: 14, fontSize: 12, color: C.text, lineHeight: 1.5,
      }}>
        <strong style={{ color: C.warn }}>ℹ️ Aliquote bilancio non modificabili</strong>
        <p style={{ margin: '4px 0 0' }}>
          Le aliquote progressive su <strong>Ricavi</strong> e <strong>Attivo Patrimoniale</strong> sono
          fissate dall'<strong>art. 22 del DM 140/2012</strong> (Tariffa Dottori Commercialisti) e
          non vanno modificate. Sono incorporate nel calcolo del preventivatore come valori fissi.
        </p>
      </div>

      {/* Minimo + storico + riduzione immobiliare */}
      <div style={S.subgroup}>
        <h3 style={S.h3}>Tariffa minima annua</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
          Il bilancio non scende mai sotto questa soglia, indipendentemente dal calcolo per scaglioni.
        </p>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <NumField label="Minimo annuo in uso (anno corrente)"
              value={data.bilancio.minimo}
              onChange={(v) => upd(['minimo'], parseFloat2(v))}
              width={120}/>
            <NumField label="Anno di riferimento"
              value={data.bilancio.anno}
              onChange={(v) => upd(['anno'], parseInt(v) || 2026)}
              suffix="" width={80}/>
            <p style={{ fontSize: 12, color: C.muted, margin: '12px 0 6px', fontWeight: 600 }}>
              Riduzione società immobiliari
            </p>
            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 6px' }}>
              Range valido di riduzione su (Ricavi + Attivo):{' '}
              <input type="number" value={data.bilancio.riduzioneImmobiliareMin}
                onChange={(e) => upd(['riduzioneImmobiliareMin'], parseFloat2(e.target.value))}
                style={{ ...S.inp, width: 50 }}/>
              {' % al '}
              <input type="number" value={data.bilancio.riduzioneImmobiliareMax}
                onChange={(e) => upd(['riduzioneImmobiliareMax'], parseFloat2(e.target.value))}
                style={{ ...S.inp, width: 50 }}/>
              {' %'}
            </p>
          </div>
          <div style={{ flex: 1, minWidth: 320 }}>
            <h4 style={{ fontSize: 12, color: C.muted, margin: '0 0 6px', fontWeight: 600 }}>STORICO MINIMI ANNUALI</h4>
            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 8px' }}>
              Memoria storica: ti serve per riferimento, non viene usata nel calcolo.
            </p>
            <table style={S.table}>
              <tbody>
                {(data.bilancio.storicoMinimi || []).map((m, i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, padding: '4px 6px' }}>
                      <input type="number" value={m.anno}
                        onChange={(e) => aggiornaStorico(i, 'anno', parseInt(e.target.value) || 0)}
                        style={{ ...S.inp, width: 70 }}/>
                    </td>
                    <td style={{ ...S.td, padding: '4px 6px', textAlign: 'right' }}>
                      <input type="number" value={m.minimo} step="0.01"
                        onChange={(e) => aggiornaStorico(i, 'minimo', parseFloat2(e.target.value))}
                        style={{ ...S.inp, width: 100 }}/>
                      {' €'}
                    </td>
                    <td style={{ ...S.td, padding: '4px 6px' }}>
                      <Btn variant="danger" size="small" onClick={() => rimuoviStorico(i)}>×</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Btn variant="ghost" size="small" onClick={aggiungiStorico}>+ Aggiungi anno</Btn>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ============== Sezione: CONSULENZA ============================= */
function SectionConsulenza({ data, update }) {
  const upd = (path, val) => update(['consulenza', ...path], val);

  const aggiornaScaglione = (i, field, value) => {
    const arr = [...data.consulenza.scaglioni];
    arr[i] = { ...arr[i], [field]: value };
    upd(['scaglioni'], arr);
  };
  const aggiungiScaglione = () => {
    const arr = [...data.consulenza.scaglioni];
    const last = arr[arr.length - 1];
    arr.push({ max: (last?.max || 0) * 2, tariffa: 0, etichetta: 'Nuovo scaglione' });
    upd(['scaglioni'], arr);
  };
  const rimuoviScaglione = (i) => {
    if (data.consulenza.scaglioni.length <= 1) {
      alert('Deve restare almeno uno scaglione');
      return;
    }
    upd(['scaglioni'], data.consulenza.scaglioni.filter((_, idx) => idx !== i));
  };

  return (
    <Section
      title="💼 Consulenza"
      subtitle="Importi fissi per scaglione di ricavi"
      defaultOpen={false}
    >
      <div style={S.subgroup}>
        <h3 style={S.h3}>Scaglioni di ricavi</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
          Importo FISSO per scaglione (NON progressivo): si applica la tariffa dello scaglione di appartenenza.
          Per ricavi oltre l'ultimo scaglione (€38.734.267,42) la consulenza viene concordata caso per caso
          con il cliente nel preventivatore.
        </p>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.td, textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600 }}>Limite superiore (€)</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600, textAlign: 'right' }}>Tariffa annua</th>
              <th style={{ ...S.td, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.consulenza.scaglioni.map((s, i) => (
              <tr key={i}>
                <td style={S.td}>
                  <input type="number" value={s.max} step="0.01"
                    onChange={(e) => aggiornaScaglione(i, 'max', parseFloat2(e.target.value))}
                    style={{ ...S.inp, width: 150, textAlign: 'right' }}/>
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <input type="number" value={s.tariffa} step="0.01"
                    onChange={(e) => aggiornaScaglione(i, 'tariffa', parseFloat2(e.target.value))}
                    style={{ ...S.inp, width: 110 }}/>
                  {' €'}
                </td>
                <td style={S.td}>
                  <Btn variant="danger" size="small" onClick={() => rimuoviScaglione(i)}>×</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <Btn variant="ghost" size="small" onClick={aggiungiScaglione}>+ Aggiungi scaglione</Btn>
        </div>
      </div>
    </Section>
  );
}

/* ============== Sezione: IMU ==================================== */
function SectionImu({ data, update }) {
  const upd = (path, val) => update(['imu', ...path], val);

  return (
    <Section
      title="🏠 IMU"
      subtitle="F24 IMU e Dichiarazione IMU"
      defaultOpen={false}
    >
      <div style={S.subgroup}>
        <h3 style={S.h3}>F24 IMU (per ciascun soggetto)</h3>
        <NumField label="Tariffa base"
          value={data.imu.f24.base}
          onChange={(v) => upd(['f24', 'base'], parseFloat2(v))}/>
        <NumField label="Per ogni immobile/terreno"
          value={data.imu.f24.perImmobile}
          onChange={(v) => upd(['f24', 'perImmobile'], parseFloat2(v))}/>
      </div>
      <div style={S.subgroup}>
        <h3 style={S.h3}>Dichiarazione IMU (per ciascun comune)</h3>
        <NumField label="Tariffa base"
          value={data.imu.dichiarazione.base}
          onChange={(v) => upd(['dichiarazione', 'base'], parseFloat2(v))}/>
        <NumField label="Per ogni immobile/terreno"
          value={data.imu.dichiarazione.perImmobile}
          onChange={(v) => upd(['dichiarazione', 'perImmobile'], parseFloat2(v))}/>
      </div>
    </Section>
  );
}

/* ============== Sezione: ALLEGATO A ============================= */
function SectionAllegatoA({ data, update }) {
  const upd = (path, val) => update(['allegatoA', ...path], val);

  const aggiornaSemplice = (id, field, value) => {
    const arr = data.allegatoA.semplici.map(v =>
      v.id === id ? { ...v, [field]: value } : v
    );
    upd(['semplici'], arr);
  };
  const aggiungiSemplice = () => {
    const arr = [...data.allegatoA.semplici];
    arr.push({ id: newId('all'), nome: 'Nuovo servizio', tariffa: 0, unita: 'per pratica' });
    upd(['semplici'], arr);
  };
  const rimuoviSemplice = (id) => {
    if (!confirm('Rimuovere questa voce dal tariffario?')) return;
    upd(['semplici'], data.allegatoA.semplici.filter(v => v.id !== id));
  };

  const aggiornaComposta = (id, field, value) => {
    const arr = data.allegatoA.composte.map(v =>
      v.id === id ? { ...v, [field]: value } : v
    );
    upd(['composte'], arr);
  };
  const aggiungiComposta = () => {
    const arr = [...data.allegatoA.composte];
    arr.push({ id: newId('allc'), nome: 'Nuovo servizio composto', base: 0, perUnita: 0, etichettaUnita: 'per unità' });
    upd(['composte'], arr);
  };
  const rimuoviComposta = (id) => {
    if (!confirm('Rimuovere questa voce dal tariffario?')) return;
    upd(['composte'], data.allegatoA.composte.filter(v => v.id !== id));
  };

  return (
    <Section
      title="📎 Allegato A — Altri Servizi"
      subtitle="Servizi camerali, vidimazioni, ravvedimenti, ecc."
      defaultOpen={false}
    >
      <div style={S.subgroup}>
        <h3 style={S.h3}>Servizi semplici (tariffa unitaria)</h3>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.td, textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600, width: '50%' }}>Voce</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600, textAlign: 'right' }}>Tariffa</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600 }}>Unità</th>
              <th style={{ ...S.td, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.allegatoA.semplici.map((v) => (
              <tr key={v.id}>
                <td style={S.td}>
                  <input type="text" value={v.nome}
                    onChange={(e) => aggiornaSemplice(v.id, 'nome', e.target.value)}
                    style={{ ...S.inpText, width: '100%' }}/>
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <input type="number" value={v.tariffa} step="0.01"
                    onChange={(e) => aggiornaSemplice(v.id, 'tariffa', parseFloat2(e.target.value))}
                    style={{ ...S.inp, width: 100 }}/>
                  {' €'}
                </td>
                <td style={S.td}>
                  <input type="text" value={v.unita}
                    onChange={(e) => aggiornaSemplice(v.id, 'unita', e.target.value)}
                    style={{ ...S.inpText, width: 130 }}/>
                </td>
                <td style={S.td}>
                  <Btn variant="danger" size="small" onClick={() => rimuoviSemplice(v.id)}>×</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <Btn variant="ghost" size="small" onClick={aggiungiSemplice}>+ Aggiungi servizio semplice</Btn>
        </div>
      </div>

      <div style={S.subgroup}>
        <h3 style={S.h3}>Servizi composti (base + per unità)</h3>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
          Per voci come Lettere d'intento e Intrastat che hanno una tariffa base + una variabile.
        </p>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.td, textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600, width: '40%' }}>Voce</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600, textAlign: 'right' }}>Base</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600, textAlign: 'right' }}>+ Per unità</th>
              <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600 }}>Etichetta unità</th>
              <th style={{ ...S.td, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.allegatoA.composte.map((v) => (
              <tr key={v.id}>
                <td style={S.td}>
                  <input type="text" value={v.nome}
                    onChange={(e) => aggiornaComposta(v.id, 'nome', e.target.value)}
                    style={{ ...S.inpText, width: '100%' }}/>
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <input type="number" value={v.base} step="0.01"
                    onChange={(e) => aggiornaComposta(v.id, 'base', parseFloat2(e.target.value))}
                    style={{ ...S.inp, width: 80 }}/>
                  {' €'}
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <input type="number" value={v.perUnita} step="0.01"
                    onChange={(e) => aggiornaComposta(v.id, 'perUnita', parseFloat2(e.target.value))}
                    style={{ ...S.inp, width: 80 }}/>
                  {' €'}
                </td>
                <td style={S.td}>
                  <input type="text" value={v.etichettaUnita}
                    onChange={(e) => aggiornaComposta(v.id, 'etichettaUnita', e.target.value)}
                    style={{ ...S.inpText, width: 200 }}/>
                </td>
                <td style={S.td}>
                  <Btn variant="danger" size="small" onClick={() => rimuoviComposta(v.id)}>×</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <Btn variant="ghost" size="small" onClick={aggiungiComposta}>+ Aggiungi servizio composto</Btn>
        </div>
      </div>
    </Section>
  );
}

/* ============== Sezione: VOCI PERSONALIZZATE ==================== */
// Le voci custom sono voci aggiunte ad-hoc che NON fanno parte del tariffario
// standard ma compaiono nel preventivatore in una sezione speciale.
// L'utente sceglie a quale "blocco" del preventivo (1.1/1.2/1.3/1.4) appartengono.
function SectionVociCustom({ data, update }) {
  const list = data.vociCustom || [];

  const aggiungi = () => {
    const arr = [...list];
    arr.push({
      id: newId('cust'),
      nome: 'Nuova voce personalizzata',
      tipo: 'fisso',           // 'fisso' | 'perUnita' | 'composta'
      tariffa: 0,
      unita: 'fisso',
      sezione: 'Consulenza',   // 'Contabilità' | 'Dichiarazioni' | 'Modello 770' | 'Consulenza' | 'IMU'
      attiva: true,
      note: '',
    });
    update(['vociCustom'], arr);
  };

  const aggiorna = (id, field, value) => {
    update(['vociCustom'], list.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const rimuovi = (id) => {
    if (!confirm('Rimuovere questa voce personalizzata?')) return;
    update(['vociCustom'], list.filter(v => v.id !== id));
  };

  return (
    <Section
      title="✨ Voci Personalizzate"
      subtitle={`${list.length} voci aggiunte da te (compaiono nel preventivatore in sezione dedicata)`}
      count={list.length}
      defaultOpen={list.length > 0}
    >
      <div style={{
        background: C.customBg, border: `1px solid ${C.custom}`, borderRadius: 8,
        padding: '10px 14px', marginBottom: 14, fontSize: 12, color: C.text,
      }}>
        <strong style={{ color: C.custom }}>Cosa sono le voci personalizzate?</strong>
        <p style={{ margin: '4px 0 0', lineHeight: 1.5 }}>
          Voci aggiuntive non presenti nel tariffario standard. Vengono mostrate
          nel preventivatore allo Step 4 con un badge viola, e finiscono nel
          blocco docx che scegli qui sotto (Contabilità, Dichiarazioni, 770, Consulenza o IMU).
        </p>
      </div>

      {list.length === 0 ? (
        <div style={{
          padding: '30px 20px', textAlign: 'center',
          color: C.muted, fontStyle: 'italic',
          background: C.light, borderRadius: 8, border: `1px dashed ${C.border}`,
        }}>
          Nessuna voce personalizzata. Aggiungine una con il bottone qui sotto.
        </div>
      ) : (
        <div>
          {list.map((v) => (
            <div key={v.id} style={{
              ...S.subgroup,
              borderLeft: `4px solid ${v.attiva ? C.custom : C.border}`,
              opacity: v.attiva ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <TextField label="Nome della voce (visibile nel preventivo)"
                    value={v.nome} onChange={(x) => aggiorna(v.id, 'nome', x)} width={'100%'}/>
                </div>
                <div>
                  <label style={S.lbl}>Sezione del preventivo</label>
                  <select value={v.sezione}
                    onChange={(e) => aggiorna(v.id, 'sezione', e.target.value)}
                    style={{ ...S.inpText, width: 180 }}>
                    <option value="Contabilità">1.1 Contabilità</option>
                    <option value="Dichiarazioni">1.2 Dichiarazioni</option>
                    <option value="Modello 770">1.3 Modello 770</option>
                    <option value="Consulenza">1.4 Consulenza</option>
                    <option value="IMU">IMU (sezione separata)</option>
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Stato</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={v.attiva}
                      onChange={(e) => aggiorna(v.id, 'attiva', e.target.checked)}/>
                    Attiva
                  </label>
                </div>
                <div>
                  <Btn variant="danger" size="small" onClick={() => rimuovi(v.id)}>Elimina</Btn>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={S.lbl}>Tipo di tariffa</label>
                <select value={v.tipo}
                  onChange={(e) => aggiorna(v.id, 'tipo', e.target.value)}
                  style={{ ...S.inpText, width: 280, marginRight: 12 }}>
                  <option value="fisso">Fisso (importo unico annuo)</option>
                  <option value="perUnita">Per unità (es. €10 × N pratiche)</option>
                  <option value="composta">Composta (base + per unità)</option>
                </select>
              </div>
              <div style={{ marginTop: 10 }}>
                {v.tipo === 'fisso' && (
                  <NumField label="Importo fisso annuo"
                    value={v.tariffa} onChange={(x) => aggiorna(v.id, 'tariffa', parseFloat2(x))}/>
                )}
                {v.tipo === 'perUnita' && (
                  <>
                    <NumField label="Tariffa per unità"
                      value={v.tariffa} onChange={(x) => aggiorna(v.id, 'tariffa', parseFloat2(x))}/>
                    <TextField label="Etichetta unità (es. 'per pratica')"
                      value={v.unita} onChange={(x) => aggiorna(v.id, 'unita', x)} width={180}/>
                  </>
                )}
                {v.tipo === 'composta' && (
                  <>
                    <NumField label="Importo base"
                      value={v.base} onChange={(x) => aggiorna(v.id, 'base', parseFloat2(x))}/>
                    <NumField label="Per ogni unità"
                      value={v.perUnita} onChange={(x) => aggiorna(v.id, 'perUnita', parseFloat2(x))}/>
                    <TextField label="Etichetta unità"
                      value={v.etichettaUnita} onChange={(x) => aggiorna(v.id, 'etichettaUnita', x)} width={180}/>
                  </>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <TextField label="Note interne (opzionale, non compaiono nel preventivo)"
                  value={v.note} onChange={(x) => aggiorna(v.id, 'note', x)} width={'100%'}/>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Btn variant="primary" onClick={aggiungi}>+ Aggiungi voce personalizzata</Btn>
      </div>
    </Section>
  );
}

/* ============== APP PRINCIPALE EDITOR =========================== */
export default function EditorApp() {
  const [data, setData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showStorico, setShowStorico] = useState(false);
  const [storicoList, setStoricoList] = useState([]);

  // Carica al mount
  useEffect(() => {
    (async () => {
      try {
        if (!window.tariffarioAPI) {
          setError("API tariffario non disponibile. Apri questa finestra dal launcher dell'app, non da un browser.");
          setLoading(false);
          return;
        }
        const r = await window.tariffarioAPI.read();
        if (!r.ok) {
          setError('Impossibile leggere il tariffario: ' + (r.error || 'errore sconosciuto'));
        } else {
          setData(r.data);
          setOriginalData(JSON.parse(JSON.stringify(r.data)));
        }
      } catch (e) {
        setError('Errore di caricamento: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isDirty = useMemo(() => {
    if (!data || !originalData) return false;
    return JSON.stringify(data) !== JSON.stringify(originalData);
  }, [data, originalData]);

  // Avviso prima di chiudere se ci sono modifiche
  useEffect(() => {
    const handler = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3500);
  };

  // Aggiorna un valore in profondità nel JSON usando il path
  const update = useCallback((path, value) => {
    setData(prev => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) {
        cur = cur[path[i]];
      }
      cur[path[path.length - 1]] = value;
      return next;
    });
  }, []);

  const salvaTutto = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const r = await window.tariffarioAPI.write(data);
      if (r.ok) {
        const updated = { ...data, ultimaModifica: r.ultimaModifica };
        setData(updated);
        setOriginalData(JSON.parse(JSON.stringify(updated)));
        showToast('✓ Tariffario salvato correttamente');
      } else {
        showToast('Errore salvataggio: ' + (r.error || ''), true);
      }
    } catch (e) {
      showToast('Errore: ' + e.message, true);
    } finally {
      setSaving(false);
    }
  };

  const ricaricaDaDisco = async () => {
    if (isDirty && !confirm('Hai modifiche non salvate che andranno perse. Ricaricare comunque?')) return;
    setLoading(true);
    try {
      const r = await window.tariffarioAPI.read();
      if (r.ok) {
        setData(r.data);
        setOriginalData(JSON.parse(JSON.stringify(r.data)));
        showToast('✓ Tariffario ricaricato dal disco');
      } else {
        showToast('Errore: ' + r.error, true);
      }
    } finally {
      setLoading(false);
    }
  };

  const ripristinaDefault = async () => {
    if (!confirm('Ripristinare il tariffario di default (BCB 2026)? Tutte le tue modifiche andranno perse (sarà comunque salvato uno snapshot prima).')) return;
    setLoading(true);
    try {
      const r = await window.tariffarioAPI.resetDefault();
      if (r.ok) {
        setData(r.data);
        setOriginalData(JSON.parse(JSON.stringify(r.data)));
        showToast('✓ Tariffario ripristinato ai valori di default');
      } else {
        showToast('Errore: ' + r.error, true);
      }
    } finally {
      setLoading(false);
    }
  };

  const apriStorico = async () => {
    const r = await window.tariffarioAPI.listStorico();
    if (r.ok) {
      setStoricoList(r.list);
      setShowStorico(true);
    } else {
      showToast('Errore lettura storico: ' + r.error, true);
    }
  };

  const ripristinaSnapshot = async (filename) => {
    if (!confirm(`Ripristinare lo snapshot del ${filename}? Le tue modifiche correnti saranno perse (lo snapshot attuale verrà comunque salvato in storico).`)) return;
    const r = await window.tariffarioAPI.restoreFromStorico(filename);
    if (r.ok) {
      setData(r.data);
      setOriginalData(JSON.parse(JSON.stringify(r.data)));
      setShowStorico(false);
      showToast('✓ Snapshot ripristinato');
    } else {
      showToast('Errore: ' + r.error, true);
    }
  };

  const esportaXLS = async () => {
    if (!data) return;
    try {
      // 1. Chiedi all'utente dove salvare
      const dialog = await window.tariffarioAPI.exportXLS();
      if (!dialog.ok) return;
      // 2. Genera l'XLS in memoria con SheetJS
      const wb = generaWorkbookXLS(data);
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      // 3. Invia il buffer al main per scriverlo su disco
      const r = await window.tariffarioAPI.saveBuffer(dialog.path, buf);
      if (r.ok) showToast('✓ Tariffario esportato in XLS');
      else showToast('Errore: ' + r.error, true);
    } catch (e) {
      showToast('Errore export: ' + e.message, true);
    }
  };

  if (loading) {
    return <div style={{ ...S.page, padding: 40, textAlign: 'center' }}>Caricamento tariffario...</div>;
  }

  if (error) {
    return (
      <div style={{ ...S.page, padding: 40 }}>
        <h2 style={{ color: C.err }}>Errore</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, color: C.navy, fontWeight: 600 }}>
              💼 Editor Tariffario BCB
              {isDirty && <span style={{ ...S.badge, background: C.warnBg, color: C.warn }}>● Modifiche non salvate</span>}
            </h1>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
              Anno {data.anno} — Ultima modifica: {fmtTimestamp(data.ultimaModifica)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn variant="primary" onClick={salvaTutto} disabled={!isDirty || saving}>
              {saving ? 'Salvataggio...' : '💾 Salva tutto'}
            </Btn>
            <Btn variant="ghost" onClick={ricaricaDaDisco}>🔄 Ricarica</Btn>
            <Btn variant="ghost" onClick={apriStorico}>🕐 Storico</Btn>
            <Btn variant="ghost" onClick={esportaXLS}>📥 Esporta XLS</Btn>
            <Btn variant="ghost" onClick={ripristinaDefault}>↺ Default 2026</Btn>
          </div>
        </div>
      </header>

      <main style={S.container}>
        <SectionContabilita    data={data} update={update}/>
        <SectionDichiarazioni  data={data} update={update}/>
        <SectionQuadri         data={data} update={update}/>
        <SectionBilancio       data={data} update={update}/>
        <SectionConsulenza     data={data} update={update}/>
        <SectionImu            data={data} update={update}/>
        <SectionAllegatoA      data={data} update={update}/>
        <SectionVociCustom     data={data} update={update}/>
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: toast.isError ? C.err : C.navy, color: 'white',
          padding: '10px 20px', borderRadius: 8, fontSize: 13,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 1000,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Modale storico */}
      {showStorico && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: C.card, borderRadius: 10, maxWidth: 600, width: '100%',
            maxHeight: '80vh', overflow: 'auto', padding: 24,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 14px', color: C.navy }}>Storico tariffario</h3>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
              Ogni salvataggio crea uno snapshot. Puoi ripristinare una versione precedente.
              Vengono conservati gli ultimi 30 snapshot.
            </p>
            {storicoList.length === 0 ? (
              <p style={{ color: C.muted, fontStyle: 'italic' }}>
                Nessuno snapshot ancora salvato. Verranno creati automaticamente al primo salvataggio.
              </p>
            ) : (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.td, textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600 }}>Data e ora snapshot</th>
                    <th style={{ ...S.td, fontSize: 11, color: C.muted, fontWeight: 600 }}>Tipo</th>
                    <th style={{ ...S.td, width: 100 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {storicoList.map((s) => (
                    <tr key={s.filename}>
                      <td style={S.td}>
                        {s.timestamp.replace(/T/, ' ').replace(/-/g, (m, i, str) => {
                          // Sostituisci i due "-" in "T15-30-45-123Z" con ":"
                          const idxT = str.indexOf('T');
                          if (i > idxT && (i === idxT + 3 || i === idxT + 6)) return ':';
                          return '-';
                        }).replace(/\.\d+Z$/, '').replace(/-(\d{2})-(\d{2})Z?$/, ':$1:$2')}
                      </td>
                      <td style={S.td}>
                        {s.isPreReset ? <span style={{ color: C.warn }}>Pre-reset</span> : 'Auto-salvato'}
                      </td>
                      <td style={S.td}>
                        <Btn variant="ghost" size="small" onClick={() => ripristinaSnapshot(s.filename)}>
                          Ripristina
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Btn variant="ghost" onClick={() => setShowStorico(false)}>Chiudi</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============== EXPORT XLS ====================================== */
// Genera un workbook XLSX dalla struttura del tariffario corrente.
// Ricostruisce la struttura del foglio Excel originale per coerenza.
function generaWorkbookXLS(data) {
  const wb = XLSX.utils.book_new();

  // Foglio CONTABILITÀ
  const cont = [
    [], ['', 'CONTABILITÀ FORFETTARIA'],
    ['', '', '', '', '', 'tariffa ANNUA'],
    ['', 'registrazione ANNUA', '', '', '', data.contabilita.forfettaria.tariffa],
    [], ['', 'CONTABILITÀ SEMPLIFICATE'],
    ['', '', '', '', '', 'tariffa ANNUA'],
    ...data.contabilita.semplificata.fasce.map(f => ['', f.etichetta, '', '', '', f.val]),
    ['', `per ogni ulteriori 100 documenti`, '', '', '', data.contabilita.semplificata.extraPer100],
    [], [], ['', "CONTABILITÀ ORDINARIE"],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', 'tariffa ANNUA'],
    ...data.contabilita.ordinaria.fasce.map(f => ['', f.etichetta, '', '', '', f.val]),
    ['', `per ogni ulteriori 100 rilevazioni`, '', '', '', data.contabilita.ordinaria.extraPer100],
    [], [],
    ['', 'EXTRA CONTABILI'],
    ...(data.contabilita.extra || []).map(v => ['', v.nome, '', '', '', v.tariffa, '', v.unita]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cont), 'CONTABILITA');

  // Foglio DICHIARAZIONI
  const dich = [
    ['', 'Tipologia Adempimenti', 'Tariffa'],
    ['', 'LIPE', data.dichiarazioni.lipe.tariffa, 'per singolo invio'],
    [],
    ['', 'Dichiarazione Annuale IVA', data.dichiarazioni.dichIVA.tariffa, 'fisso'],
    [], [], [], ['', 'CU'],
    ['', 'CU contabilità interne', data.dichiarazioni.cu.interne.tariffa, 'fisso'],
    ['', 'CU consulenze solo telematico', data.dichiarazioni.cu.soloTel.tariffa, 'fisso'],
    ['', 'CU consulenze telematico + excel', data.dichiarazioni.cu.telExcel.tariffa, 'base +'],
    ['', '', data.dichiarazioni.cu.perPercipiente.tariffa, 'per percipiente'],
    [],
    ['', 'Modello 770', data.dichiarazioni.m770.fisso.tariffa, 'fisso'],
    ['', 'in alternativa'],
    ['', 'BASE + RIGA VERSAMENTI', data.dichiarazioni.m770.base.tariffa, 'base +'],
    ['', '', data.dichiarazioni.m770.perRigo.tariffa, 'per rigo'],
    [],
    ['', 'Pagamento Modelli F24', data.dichiarazioni.f24.fisso.tariffa, 'fisso'],
    ['', 'in alternativa'],
    ['', '', data.dichiarazioni.f24.perDelega.tariffa, 'per delega'],
    [], [], [],
    ['', 'Sistema Tessera Sanitaria', data.dichiarazioni.sistemats.tariffa, 'fisso'],
    [], ['', 'EXTRA DICHIARATIVI'],
    ...(data.dichiarazioni.extra || []).map(v => {
      if (v.tipo === 'composta') return ['', v.nome, v.base, `+${v.perUnita} ${v.etichettaUnita || ''}`];
      return ['', v.nome, v.tariffa, v.unita];
    }),
    [], [], ['', 'QUADRI MODELLO UNICO PERSONE FISICHE'],
    ...data.quadri.upf.voci.map(v => ['', v.codice, v.nome, v.modalita, v.tariffa]),
    [], ['', 'QUADRI MODELLO UNICO SOC. PERSONE'],
    ...data.quadri.usp.voci.map(v => ['', v.codice, v.nome, v.modalita, v.tariffa]),
    [], ['', 'QUADRI MODELLO UNICO SOC. CAPITALI'],
    ...data.quadri.usc.voci.map(v => ['', v.codice, v.nome, v.modalita, v.tariffa]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dich), 'DICHIARAZIONI');

  // Foglio BILANCIO
  const bil = [
    ['TARIFFARIO BILANCIO'], [], ['art. 22 DM 140/2012, art. 34 Tariffa'], [], ['A) RICAVI'],
    ['', '', '', '', '', 'tariffa annua ordin.'],
    [],
    ...data.bilancio.ricaviScaglioni.map(s => ['', s.etichetta, '', '', '', s.aliquota]),
    ['', 'oltre l\'ultimo scaglione', '', '', '', data.bilancio.ricaviOltreUltimoScaglione],
    [], [], [], ['B) ATTIVITÀ'],
    ['', '', '', '', '', 'tariffa annua ordin.'],
    [],
    ...data.bilancio.attivoScaglioni.map(s => ['', s.etichetta, '', '', '', s.aliquota]),
    ['', 'oltre l\'ultimo scaglione', '', '', '', data.bilancio.attivoOltreUltimoScaglione],
    [], [],
    [`Tariffa minima (anno ${data.bilancio.anno}): ${data.bilancio.minimo} €`],
    [], ['STORICO MINIMI'],
    ...(data.bilancio.storicoMinimi || []).map(m => ['', m.anno, m.minimo]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bil), 'BILANCIO');

  // Foglio CONSULENZA
  const cons = [
    ['TARIFFARIO CONSULENZA'], [], ['A) RICAVI'],
    ['', '', '', '', '', 'tariffa annua'],
    [],
    ...data.consulenza.scaglioni.map(s => ['', s.etichetta, '', '', '', s.tariffa]),
    [], [],
    ['', 'oltre ultimo scaglione: tariffa concordata caso per caso'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cons), 'CONSULENZA');

  // Foglio IMU
  const imu = [
    [], ['F24 IMU'],
    ['', 'Per ciascun soggetto:'], [], ['', 'tariffa base', '', '', '', data.imu.f24.base],
    ['', 'per ogni immobile/terreno', '', '', '', data.imu.f24.perImmobile],
    [], [],
    ['DICHIARAZIONE IMU'],
    ['', 'Per ciascun comune:'], [], ['', 'tariffa base', '', '', '', data.imu.dichiarazione.base],
    ['', 'per ogni immobile/terreno', '', '', '', data.imu.dichiarazione.perImmobile],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(imu), 'IMU');

  // Foglio ALLEGATO A
  const all = [
    ['TARIFFARIO - ALLEGATO A'], [data.allegatoA.vigenza], [],
    ['ALTRI SERVIZI CONTABILI'],
    ['', '', '', '', '', 'Euro'],
    [],
    ...data.allegatoA.semplici.map(v => ['', v.nome, '', '', '', v.tariffa, v.unita]),
    [], ['SERVIZI COMPOSTI (base + per unità)'],
    ...data.allegatoA.composte.map(v => ['', v.nome, '', '', '', `${v.base} + ${v.perUnita} ${v.etichettaUnita}`]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), 'tariffa A BCB');

  // Foglio VOCI CUSTOM (se presenti)
  if ((data.vociCustom || []).length > 0) {
    const cust = [
      ['VOCI PERSONALIZZATE'], [],
      ['Nome', 'Tipo', 'Tariffa', 'Sezione', 'Attiva', 'Note'],
      ...data.vociCustom.map(v => {
        const tariffa = v.tipo === 'composta'
          ? `${v.base} + ${v.perUnita} ${v.etichettaUnita || ''}`
          : v.tipo === 'perUnita'
          ? `${v.tariffa} ${v.unita || ''}`
          : v.tariffa;
        return [v.nome, v.tipo, tariffa, v.sezione, v.attiva ? 'sì' : 'no', v.note || ''];
      }),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cust), 'Voci Custom');
  }

  return wb;
}
