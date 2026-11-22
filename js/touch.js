// Flugsimulator – Knöpfe auf dem Bildschirm (iPad): Schubhebel links, Steuerknüppel rechts, Pedale unten, Knöpfe am Rand.
// Vorbild: der runde Steuerknüppel und der Schubhebel aus Frontlinie 3.
const el = (tag, cls, html, eltern) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (eltern) eltern.appendChild(e); return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ein Knopf, der beim Drücken und Loslassen etwas tut
export function knopf(eltern, text, cls, runter, hoch) {
  const b = el('div', 'knopf ' + (cls || ''), text, eltern); let id = null;
  b.addEventListener('pointerdown', e => { if (id !== null) return; e.preventDefault(); id = e.pointerId; try { b.setPointerCapture(id); } catch (x) { /* egal */ } b.classList.add('an'); runter(); });
  const los = e => { if (e.pointerId !== id) return; id = null; b.classList.remove('an'); if (hoch) hoch(); };
  b.addEventListener('pointerup', los); b.addEventListener('pointercancel', los);
  return b;
}
// Schubhebel: senkrechter Schieber, unten = Leerlauf, oben = Vollgas
export function schubhebel(eltern, setze, lese) {
  const h = el('div', 'schub', '<i></i><b></b><em></em>', eltern), fuell = h.querySelector('i'), griff = h.querySelector('b'), txt = h.querySelector('em'); let id = null;
  const male = v => { fuell.style.height = `calc((100% - 28px) * ${v})`; griff.style.bottom = `calc(14px + (100% - 28px) * ${v} - 13px)`; txt.textContent = 'Gas ' + Math.round(v * 100) + ' %'; };
  const ev = e => { const r = h.getBoundingClientRect(), v = clamp(1 - (e.clientY - r.top - 14) / (r.height - 28), 0, 1); setze(v); male(v); };
  h.addEventListener('pointerdown', e => { if (id !== null) return; e.preventDefault(); id = e.pointerId; try { h.setPointerCapture(id); } catch (x) { /* egal */ } ev(e); });
  h.addEventListener('pointermove', e => { if (e.pointerId === id) ev(e); });
  const los = e => { if (e.pointerId === id) id = null; }; h.addEventListener('pointerup', los); h.addEventListener('pointercancel', los);
  h.zeige = () => { if (id === null) male(lese()); };
  male(lese()); return h;
}
// runder Steuerknüppel: x nach rechts, y nach oben (drücken). Loslassen = Mitte.
export function knueppel(eltern, ziel) {
  const s = el('div', 'tstick', '', eltern), k = el('div', 'tknob', '', s); let id = null;
  const setze = e => {
    const r = s.getBoundingClientRect(), R = r.width / 2, M = R * 0.62; let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const d = Math.hypot(dx, dy);
    if (d > M) { dx *= M / d; dy *= M / d; }
    k.style.transform = `translate(${dx}px,${dy}px)`;
    // kleine tote Mitte, dann sanft ansteigend: Um die Mitte herum steuert es sich fein
    const form = v => { const a = Math.abs(v); return a < 0.08 ? 0 : Math.sign(v) * Math.pow((a - 0.08) / 0.92, 1.4); };
    ziel.x = form(dx / M); ziel.y = form(-dy / M); ziel.an = true;
  };
  const los = e => { if (e && e.pointerId !== id) return; id = null; ziel.x = ziel.y = 0; ziel.an = false; k.style.transform = ''; s.classList.remove('an'); };
  s.addEventListener('pointerdown', e => { if (id !== null) return; e.preventDefault(); id = e.pointerId; try { s.setPointerCapture(id); } catch (x) { /* egal */ } s.classList.add('an'); setze(e); });
  s.addEventListener('pointermove', e => { if (e.pointerId === id) setze(e); });
  s.addEventListener('pointerup', los); s.addEventListener('pointercancel', los);
  return s;
}

// Alles zusammen für das Spiel. eingabe = Eingabe aus eingabe.js, tu = { kamera(), menue(), mitte(), neigen() }
export function baueTouch(eingabe, tu) {
  const wurzel = el('div', 'touch', '', document.body);
  const links = el('div', 't-links', '', wurzel), rechts = el('div', 't-rechts', '', wurzel), unten = el('div', 't-unten', '', wurzel), oben = el('div', 't-oben', '', wurzel);
  const hebel = schubhebel(links, v => { eingabe.e.gas = v; }, () => eingabe.e.gas);
  const spalteL = el('div', 't-spalte', '', links);
  knopf(spalteL, 'Klappen ▼', 'blau', () => eingabe.druecke('klappenAus'));
  knopf(spalteL, 'Klappen ▲', 'blau', () => eingabe.druecke('klappenEin'));
  knopf(spalteL, 'Bremse', 'rot', () => { eingabe.bremsKnopf = 1; }, () => { eingabe.bremsKnopf = 0; });
  const spalteR = el('div', 't-spalte', '', rechts);
  knopf(spalteR, 'Trimm: Nase ▲', '', () => { eingabe.trimmKnopf = 1; }, () => { eingabe.trimmKnopf = 0; });
  knopf(spalteR, 'Trimm: Nase ▼', '', () => { eingabe.trimmKnopf = -1; }, () => { eingabe.trimmKnopf = 0; });
  const stick = knueppel(rechts, eingabe.stick);
  knopf(unten, '◀ Seitenruder', 'pedal', () => { eingabe.pedal = -1; }, () => { eingabe.pedal = 0; });
  knopf(unten, 'Seitenruder ▶', 'pedal', () => { eingabe.pedal = 1; }, () => { eingabe.pedal = 0; });
  knopf(oben, 'Ansicht', 'klein', () => tu.kamera());
  const neig = knopf(oben, 'Neigen: aus', 'klein', () => tu.neigen());
  knopf(oben, 'Mitte', 'klein', () => tu.mitte());
  knopf(oben, 'Hilfen', 'klein', () => eingabe.druecke('hilfe'));
  knopf(oben, 'Menü', 'klein', () => tu.menue());
  return {
    wurzel,
    // jedes Bild: Schubhebel nachführen; beim Neigen oder mit dem Handy braucht man den Knüppel auf dem Bildschirm nicht
    zeige(neigenAn, handyAn) { hebel.zeige(); neig.textContent = 'Neigen: ' + (neigenAn ? 'an' : 'aus'); stick.style.visibility = neigenAn || handyAn ? 'hidden' : ''; }
  };
}
