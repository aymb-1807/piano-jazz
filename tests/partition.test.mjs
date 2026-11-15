// Réparation d'un MusicXML emballé dans un export de type tableur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deballerMusicXML } from '../js/partition.js?v=2026-11-15k';

const ORIGINAL = [
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
  '<score-partwise version="4.0">',
  '<movement-title>Essai &amp; test</movement-title>',
  '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>',
  '</score-partwise>',
];
const echapper = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const EMBALLE = '<?xml version="1.0" encoding="UTF-8" ?>\n<root>\n' +
  ORIGINAL.map(l => `  <row>\n    <_xml_version_1_0_encoding_utf_8_>${echapper(l)}</_xml_version_1_0_encoding_utf_8_>\n  </row>`).join('\n') + '\n</root>\n';

test('un MusicXML emballé est reconstitué à l\'identique', () => {
  const r = deballerMusicXML(EMBALLE);
  assert.ok(r.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise'));
  assert.equal(r.trim().split('\n').slice(1).join('\n'), ORIGINAL.join('\n'));
  assert.ok(r.includes('Essai &amp; test'), 'les entités du MusicXML d\'origine restent échappées une fois');
});

test('un MusicXML normal n\'est pas touché', () => {
  assert.equal(deballerMusicXML('<?xml version="1.0"?>\n' + ORIGINAL.join('\n')), null);
});

test('un autre XML emballé (pas une partition) n\'est pas touché', () => {
  assert.equal(deballerMusicXML('<root><row><a>&lt;html&gt;</a></row></root>'), null);
});
