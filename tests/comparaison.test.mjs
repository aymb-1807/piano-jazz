// Lecture MusicXML et comparaison prise / notes écrites (ADR-0005).
// Partition utilisée : exemples/notes-guides.musicxml (exercice original : 3ce et 7e à la main droite,
// fondamentale à la main gauche, en blanches).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireNotesMusicXML } from '../js/musicxml.js?v=2026-11-15k';
import { analyserPrise } from '../js/analyse.js?v=2026-11-15k';

const XML = readFileSync(new URL('../exemples/notes-guides.musicxml', import.meta.url), 'utf8');
const PARTITION = lireNotesMusicXML(XML);
const charger = (nom) => JSON.parse(readFileSync(new URL(`./prises/${nom}.json`, import.meta.url), 'utf8'));
const seg = (r, mesure, symbole) => r.segments.find(s => s.mesure === mesure && s.symbole === symbole);

test('lecture MusicXML : mesures, accords plaqués, deux portées (backup)', () => {
  assert.equal(PARTITION.mesures, 4);
  assert.equal(PARTITION.notes.length, 24);
  const m1 = PARTITION.notes.filter(n => n.mesure === 0 && n.temps === 0).map(n => n.hauteur).sort((a, b) => a - b);
  assert.deepEqual(m1, [51, 62, 67]); // E♭3 (main gauche), ré4 et sol4 (main droite)
  assert.ok(PARTITION.notes.every(n => n.duree === 2));
});

test('lecture MusicXML : liaisons et ornements ignorés, silences et forward comptés', () => {
  const xml = `<score-partwise version="4.0"><part id="P1"><measure number="1">
    <attributes><divisions>2</divisions></attributes>
    <note><rest/><duration>2</duration></note>
    <note><grace/><pitch><step>B</step><octave>4</octave></pitch><duration>0</duration></note>
    <note><pitch><step>C</step><octave>5</octave></pitch><duration>6</duration><tie type="start"/></note>
  </measure><measure number="2">
    <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><tie type="stop"/></note>
    <forward><duration>2</duration></forward>
    <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration></note>
  </measure></part></score-partwise>`;
  const p = lireNotesMusicXML(xml);
  assert.equal(p.mesures, 2);
  assert.deepEqual(p.notes.map(n => [n.mesure, n.temps, n.hauteur]), [[0, 1, 72], [1, 2, 66]]);
});

test('prise juste comparée à la partition : fidélité 100 %, rien de manqué ni d\'ajouté hors accord', () => {
  const { resume } = analyserPrise(charger('juste'), {}, { partition: PARTITION });
  const p = resume.partition;
  assert.equal(p.comparee, true);
  assert.equal(p.ecrites, 24);
  assert.equal(p.fidelite, 100);
  assert.equal(p.manquees, 0);
  assert.equal(p.ajouteesHors, 0);
  assert.ok(p.octave > 0, 'voicings joués dans un autre registre : notes « à l\'octave »');
});

test('fausse note non écrite : reste une fausse note et apparaît comme ajout hors accord', () => {
  const r = analyserPrise(charger('fausse-note'), {}, { partition: PARTITION });
  assert.equal(seg(r, 1, 'Ebmaj7').fausses.length, 1);
  assert.deepEqual(seg(r, 1, 'Ebmaj7').partition.ajouteesHors, ['E3']);
});

test('note hors accord ÉCRITE dans la partition : plus reprochée', () => {
  const avecMi = { ...PARTITION, notes: [...PARTITION.notes, { mesure: 0, temps: 0, duree: 2, hauteur: 52, portee: 2 }] };
  const r = analyserPrise(charger('fausse-note'), {}, { partition: avecMi });
  const s = seg(r, 1, 'Ebmaj7');
  assert.equal(s.fausses.length, 0);
  assert.equal(s.notesEcritesHorsAccord, 1);
  assert.equal(r.resume.faussesNotes, 0);
});

test('note manquante : 7e de Fm7 non jouée = note de la partition manquée', () => {
  const r = analyserPrise(charger('note-manquante'), {}, { partition: PARTITION });
  const s = seg(r, 2, 'Fm7');
  assert.deepEqual(s.manquantes, ['7e']);
  assert.ok(s.partition.manquees.some(n => n.startsWith('Eb')), JSON.stringify(s.partition));
});

test('note guide absente de la partition elle-même : pas reprochée', () => {
  const sansMib = { ...PARTITION, notes: PARTITION.notes.filter(n => !(n.mesure === 1 && n.temps === 0 && n.hauteur % 12 === 3)) };
  const r = analyserPrise(charger('note-manquante'), {}, { partition: sansMib });
  const s = seg(r, 2, 'Fm7');
  assert.deepEqual(s.manquantes, []);
  assert.deepEqual(s.manquantesEcrites, ['7e']);
  assert.equal(r.resume.partition.guidesAbsentesDeLaPartition, 1);
});

test('jeu libre comparé à la partition', () => {
  const { resume } = analyserPrise(charger('libre-juste'), {}, { partition: PARTITION });
  assert.equal(resume.partition.comparee, true);
  assert.equal(resume.partition.manquees, 0);
  assert.equal(resume.partition.ajouteesHors, 0);
});

test('nombre de mesures différent : comparaison refusée avec la raison', () => {
  const { resume } = analyserPrise(charger('juste'), {}, { partition: { mesures: 5, notes: [] } });
  assert.equal(resume.partition.comparee, false);
  assert.match(resume.partition.raison, /5 mesures/);
});

test('note jouée à la place d\'une note écrite : « X au lieu de Y »', () => {
  // partition où E♭maj7 (mes. 1) écrit mi bécarre... non : on écrit fa (F4) et la prise joue mi♭ ? On fabrique plus simple :
  // partition = la prise juste ; la prise joue G♭3 au lieu de G3 dans le voicing de E♭maj7.
  const p = charger('juste');
  const ecrites = p.notes.map(n => ({ mesure: Math.floor(n.debut / 4000), temps: (n.debut % 4000) / 1000 >= 2 ? 2 : 0, duree: 2, hauteur: n.hauteur, portee: 1 }));
  const jouee = { ...p, notes: p.notes.map(n => (n.hauteur === 55 && n.debut < 100 ? { ...n, hauteur: 54 } : n)) };
  const r = analyserPrise(jouee, {}, { partition: { mesures: 4, notes: ecrites } });
  const s = seg(r, 1, 'Ebmaj7');
  assert.deepEqual(s.partition.remplacees, [{ jouee: 'Gb3', ecrite: 'G3' }]);
  assert.equal(r.resume.partition.remplacees, 1);
  assert.match(r.resume.aTravailler[0].raisons.join(' '), /Gb au lieu de G/);
});
