// Tests du moteur d'analyse sur les prises de référence.
// Lancer : node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyserPrise, classerNote, typeVoicing, calculerCalage } from '../js/analyse.js?v=2026-11-15l';
import * as analyserModule from '../js/analyse.js?v=2026-11-15l';
import { analyserAccord } from '../js/accords.js?v=2026-11-15l';

const charger = (nom) => JSON.parse(readFileSync(new URL(`./prises/${nom}.json`, import.meta.url), 'utf8'));
const analyser = (nom) => analyserPrise(charger(nom));
const seg = (r, mesure, symbole) => r.segments.find(s => s.mesure === mesure && s.symbole === symbole);

test('prise juste : tout est en place, aucune erreur', () => {
  const { segments, resume } = analyser('juste');
  assert.equal(segments.length, 8);
  assert.equal(resume.accordsJoues, 8);
  assert.equal(resume.notesGuidesCompletes, 100);
  assert.equal(resume.faussesNotes, 0);
  assert.equal(resume.rythme.enPlace, 100);
  assert.ok(Math.abs(resume.rythme.decalageMoyenMs) <= 5);
  assert.deepEqual(resume.aTravailler, []);
  assert.ok(segments.every(s => s.voicings[0]?.type === 'shell F-3-7'), 'voicings reconnus comme shells');
});

test('note manquante : 7e de Fm7 mesure 2 signalée, rien d\'autre', () => {
  const r = analyser('note-manquante');
  assert.deepEqual(seg(r, 2, 'Fm7').manquantes, ['7e']);
  assert.equal(r.resume.manquesParType['7e'], 1);
  assert.equal(r.resume.faussesNotes, 0);
  assert.equal(r.resume.aTravailler[0].mesure, 2);
});

test('fausse note : mi bécarre structurel sur Ebmaj7 détecté', () => {
  const r = analyser('fausse-note');
  const s = seg(r, 1, 'Ebmaj7');
  assert.equal(s.fausses.length, 1);
  assert.equal(s.fausses[0].note, 'E3');
  assert.equal(s.fausses[0].classe, 'hors');
  assert.equal(r.resume.faussesNotes, 1);
  assert.equal(r.resume.aTravailler[0].mesure, 1);
});

test('décalage : retard de 90 ms mesuré sur toutes les attaques', () => {
  const { resume } = analyser('decalage-retard');
  assert.equal(resume.rythme.attaquesMesurees, 8);
  assert.ok(Math.abs(resume.rythme.decalageMoyenMs - 90) <= 5, `moyenne ${resume.rythme.decalageMoyenMs}`);
  assert.equal(resume.rythme.enPlace, 0);
  assert.equal(resume.faussesNotes, 0, 'un retard ne crée pas de fausse note');
});

test('anticipation : attaque avant le temps rattachée à l\'accord suivant', () => {
  const r = analyser('anticipation');
  const cm7 = seg(r, 1, 'Cm7');
  assert.equal(cm7.manquantes.length, 0);
  assert.ok(Math.abs(cm7.decalageMs + 125) <= 5, `décalage ${cm7.decalageMs}`);
  assert.equal(seg(r, 1, 'Ebmaj7').fausses.length, 0, 'les notes de Cm7 ne sont pas des fausses notes de Ebmaj7');
  assert.equal(r.resume.faussesNotes, 0);
});

test('notes de passage : chromatismes brefs à contretemps non reprochés', () => {
  const r = analyser('notes-de-passage');
  assert.equal(r.resume.faussesNotes, 0);
  assert.equal(r.resume.notesDePassage, 2);
});

test('pédale : notes staccato tenues par la pédale comptent comme sonnantes', () => {
  const r = analyser('pedale');
  assert.equal(r.resume.notesGuidesCompletes, 100);
  // sans pédale, les mêmes notes (150 ms < 0,25 temps) ne compteraient pas comme sonnantes
  const sansPedale = analyserPrise({ ...charger('pedale'), pedale: [] });
  assert.equal(sansPedale.resume.notesGuidesCompletes, 0);
});

test('calage : un retard égal au calage mesuré est en place', () => {
  const { resume } = analyser('calage');
  assert.equal(resume.rythme.enPlace, 100);
  assert.ok(Math.abs(resume.rythme.decalageMoyenMs) <= 5);
});

test('accord non joué : mesure 3 silencieuse signalée en priorité', () => {
  const r = analyser('accord-non-joue');
  assert.equal(r.resume.accordsJoues, 6);
  assert.equal(seg(r, 3, 'Gm7').joue, false);
  assert.equal(r.resume.aTravailler[0].mesure, 3);
});

test('classement des notes selon la qualité de l\'accord', () => {
  const c = (sym, h) => classerNote(analyserAccord(sym), h);
  assert.equal(c('Cmaj7', 64), 'accord');   // mi
  assert.equal(c('Cmaj7', 62), 'tension');  // ré = 9
  assert.equal(c('Cmaj7', 65), 'eviter');   // fa = 11 juste
  assert.equal(c('Cmaj7', 63), 'hors');     // mi♭
  assert.equal(c('C7', 61), 'tension');     // ré♭ = ♭9
  assert.equal(c('C7', 65), 'eviter');      // 11 juste sur dominante
  assert.equal(c('C7b9', 61), 'tension');   // écrit dans le symbole
  assert.equal(c('Dm7b5', 63), 'eviter');   // mi♭ = ♭9 sur m7♭5
  assert.equal(c('Gm', 66), 'tension');     // fa♯ = 7M sur triade mineure (Gm(maj7))
});

test('types de voicing', () => {
  const t = (sym, hs) => typeVoicing(analyserAccord(sym), hs).type;
  assert.equal(t('Fm7', [41, 56, 63]), 'shell F-3-7');
  assert.equal(t('Fm7', [41, 51, 56]), 'shell F-7-3');
  assert.equal(t('Dm7', [53, 57, 60, 64]), 'sans fondamentale, type A (3ce en bas)');   // fa la do mi
  assert.equal(t('G7', [53, 57, 59, 64]), 'sans fondamentale, type B (7e en bas)');    // fa la si mi
  assert.equal(t('Cmaj7', [48, 52, 55, 59]), 'position fondamentale');
});

test('calibration : médiane des écarts, valeurs aberrantes écartées', () => {
  const temps = Array.from({ length: 8 }, (_, i) => ({ t: i * 750 }));
  const notes = [42, 38, 45, 40, 39, 41, 600, 44].map((e, i) => i * 750 + e); // 600 ms : aberrant
  const { calageMs } = calculerCalage(temps, notes);
  assert.equal(calageMs, 41);
});

test('format de prise inconnu refusé', () => {
  assert.throws(() => analyserPrise({ ...charger('juste'), format: 'autre' }), /format/);
});

// --- Modes « accords seulement » et « libre » --------------------------------------

test('mode accords : retard ignoré, rien à travailler', () => {
  const { resume } = analyser('accords-seulement');
  assert.equal(resume.mode, 'accords');
  assert.equal(resume.rythme, null);
  assert.equal(resume.notesGuidesCompletes, 100);
  assert.deepEqual(resume.aTravailler, []);
});

test('libre juste : chaque accord retrouvé malgré le rubato', () => {
  const r = analyser('libre-juste');
  assert.equal(r.resume.libre, true);
  assert.equal(r.resume.rythme, null);
  assert.deepEqual(r.segments.map(s => s.symbole), ['Ebmaj7', 'Cm7', 'Fm7', 'Bb7', 'Gm7', 'C7', 'Fm7', 'Bb7']);
  assert.ok(r.segments.every(s => s.joue && s.manquantes.length === 0));
  assert.equal(r.resume.faussesNotes, 0);
});

test('libre saut : l\'accord sauté est signalé, les suivants restent alignés', () => {
  const r = analyser('libre-saut');
  assert.equal(seg(r, 3, 'Gm7').joue, false);
  assert.equal(seg(r, 3, 'C7').joue, true);
  assert.equal(seg(r, 3, 'C7').manquantes.length, 0);
  assert.equal(r.resume.aTravailler[0].mesure, 3);
});

test('libre fausse note : la bécarre sur Bb7 détecté', () => {
  const r = analyser('libre-fausse-note');
  const s = seg(r, 2, 'Bb7');
  assert.equal(s.fausses.length, 1);
  assert.equal(s.fausses[0].note, 'A3');
  assert.equal(r.resume.faussesNotes, 1);
});

test('libre arrêt en cours : seuls les accords atteints sont jugés', () => {
  const r = analyser('libre-arrete');
  assert.equal(r.segments.length, 3);
  assert.equal(r.resume.arreteMesure, 2);
  assert.equal(r.resume.accordsJoues, 3);
});

test('libre arpégé : accords roulés reconnus comme des accords', () => {
  const r = analyser('libre-arpege');
  assert.equal(r.segments.length, 8);
  assert.ok(r.segments.every(s => s.joue && s.manquantes.length === 0), JSON.stringify(r.segments.map(s => [s.symbole, s.manquantes])));
  assert.equal(r.resume.faussesNotes, 0);
  assert.ok(r.segments.every(s => s.voicings.length >= 1), 'un voicing par accord');
});

test('libre, pédale tenue tout du long : les accords ne se mélangent pas', () => {
  const r = analyser('libre-pedale-continue');
  assert.deepEqual(r.segments.map(s => s.symbole), ['Ebmaj7', 'Cm7', 'Fm7', 'Bb7', 'Gm7', 'C7', 'Fm7', 'Bb7']);
  assert.equal(r.resume.faussesNotes, 0);
});

test('touches effleurées (vélocité < 8) ignorées', () => {
  const p = charger('juste');
  const avec = { ...p, notes: [...p.notes, { hauteur: 52, debut: 0, fin: 1900, velocite: 1 }] }; // mi bécarre inaudible sur Ebmaj7
  assert.equal(analyserPrise(avec).resume.faussesNotes, 0);
});

// --- Indicateur de pédale ---------------------------------------------------------

test('pédale : non utilisée', () => {
  const { pedale } = analyser('juste').resume;
  assert.equal(pedale.utilisee, false);
  assert.equal(pedale.appuis, 0);
  assert.equal(pedale.alerte, null);
});

test('pédale : relevée à chaque accord, pas d\'alerte', () => {
  const { pedale } = analyser('pedale').resume;
  assert.equal(pedale.appuis, 8);
  assert.equal(pedale.appuisParAccord, 1);
  assert.ok(pedale.partEnfoncee > 80 && pedale.partEnfoncee <= 100, `part ${pedale.partEnfoncee}`);
  assert.equal(pedale.alerte, null);
});

test('pédale : tenue tout du long, alerte', () => {
  const { pedale } = analyser('libre-pedale-continue').resume;
  assert.equal(pedale.appuis, 1);
  assert.ok(pedale.plusLongMs > 15000, `plus long ${pedale.plusLongMs}`);
  assert.match(pedale.alerte, /d'affilée/);
});

test('pédale : jamais relevée avant la fin de la prise', () => {
  const p = charger('libre-juste');
  const { pedale } = analyserPrise({ ...p, pedale: [{ t: 500, enfoncee: true }] }).resume;
  assert.equal(pedale.appuis, 1);
  assert.ok(pedale.alerte);
});

test('pédale syncopée : appui juste après l\'accord, aucun accord superposé', () => {
  const { pedale } = analyser('pedale').resume; // appui 20 ms après chaque accord, relevée 30 ms avant le suivant
  assert.ok(pedale.delaiMedianMs >= 0 && pedale.delaiMedianMs <= 50, `délai ${pedale.delaiMedianMs}`);
  assert.equal(pedale.accordsSuperposes, 0);
  assert.equal(pedale.accordsSansChangement, 0);
});

test('pédale non relevée aux changements : accords superposés signalés', () => {
  const p = charger('pedale');
  // appuis décalés : enfoncée 300 ms AVANT chaque changement, relevée 300 ms après → chaque accord attaqué pédale enfoncée
  const ped = p.pedale.map((e, i) => ({ t: e.t + (e.enfoncee ? 1700 : 330), enfoncee: e.enfoncee }));
  const { pedale } = analyserPrise({ ...p, pedale: ped }).resume;
  assert.ok(pedale.accordsSuperposes >= 6, `superposés ${pedale.accordsSuperposes}`);
  assert.match(pedale.alerte, /encore enfoncée/);
});

// --- Taux de réussite par mesure ------------------------------------------------------

test('réussite par mesure : prise juste = 100 % partout', () => {
  const { parMesure, plusFaibles, decrochage } = analyser('juste').resume;
  assert.deepEqual(parMesure.map(m => m.taux), [100, 100, 100, 100]);
  assert.deepEqual(plusFaibles, []);
  assert.equal(decrochage, null);
});

test('réussite par mesure : la mesure fautive est la plus faible', () => {
  const { parMesure, plusFaibles } = analyser('fausse-note').resume;
  assert.equal(plusFaibles[0].mesure, 1);
  assert.ok(parMesure[0].taux < 100 && parMesure[1].taux === 100, JSON.stringify(parMesure));
  const silence = analyser('accord-non-joue').resume;
  assert.equal(silence.parMesure.find(m => m.mesure === 3).taux, 0);
});

test('réussite par mesure : décrochage détecté quand la fin se dégrade', () => {
  // 8 mesures : 4 réussies puis 4 ratées
  const { reussiteParMesure } = analyserModule;
  const segs = Array.from({ length: 8 }, (_, i) => ({
    mesure: i + 1, symbole: 'C7', nc: false, joue: true, attendues: 2,
    manquantes: i < 4 ? [] : ['3ce', '7e'], fausses: i < 4 ? [] : [{}], decalageMs: null,
  }));
  const r = reussiteParMesure(segs, undefined, false);
  assert.equal(r.decrochage.aPartirDe, 5);
  assert.ok(r.decrochage.avant > r.decrochage.apres + 20);
});
