'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const core = require('../app-core');

function makeElement(id) {
  const listeners = new Map();
  return {
    id,
    value: '',
    disabled: false,
    style: {},
    dataset: {},
    className: '',
    textContent: '',
    innerHTML: '',
    children: [],
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        this.dataset ||= {};
        this.dataset[key] = value;
      } else {
        this[name] = value;
      }
    },
    click() {},
    contains() { return true; }
  };
}

function loadApplication() {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };

  getElement('eventType').value = 'individual';
  getElement('scoringType').value = 'scored';
  getElement('teamSize').value = '2';

  const document = {
    getElementById: getElement,
    querySelector(selector) {
      if (selector === '#eventsTable tbody') return getElement('eventsTableBody');
      if (selector === '#standingsTable tbody') return getElement('standingsTableBody');
      return null;
    },
    createElement(tagName) {
      return makeElement(tagName);
    },
    createTextNode(textContent) {
      return { textContent };
    }
  };

  const localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };

  const context = vm.createContext({
    alert() {},
    confirm() { return true; },
    console,
    document,
    localStorage,
    Blob,
    Event: class Event { constructor(type) { this.type = type; } },
    FileReader: class FileReader {},
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    window: {}
  });
  context.window = context;

  const coreScript = readFileSync('app-core.js', 'utf8');
  vm.runInContext(coreScript, context, { filename: 'app-core.js' });

  const script = readFileSync('app-ui.js', 'utf8');
  vm.runInContext(script, context, { filename: 'app-ui.js' });

  return {
    evaluate(source) {
      return vm.runInContext(source, context);
    }
  };
}

test('the production state starts with bracket support', () => {
  const app = loadApplication();
  const initialState = app.evaluate('JSON.parse(JSON.stringify(defaultState()))');

  assert.deepEqual(Object.keys(initialState), [
    'schemaVersion',
    'events',
    'tieBreakerHierarchy',
    'participants',
    'eventRawResults',
    'teamAssignments',
    'teamBrackets',
    'participantScores',
    'participantEventCount',
    'participantEventResults'
  ]);
});

test('the production renderer accepts v3 participants and event-ID-keyed results', () => {
  const app = loadApplication();

  assert.doesNotThrow(() => app.evaluate(`
    state = defaultState();
    state.events = [{ id: 'event-1', title: 'Throw', type: 'individual', scoringType: 'scored' }];
    state.participants = [{ id: 'alex', name: 'Alex' }];
    state.eventRawResults['event-1'] = [{ participantId: 'alex', value: 10, raw: '10', points: 1 }];
    el.resultEventSelect.value = 'event-1';
    syncAll();
  `));
});

test('the core state factory returns independent state objects', () => {
  const first = core.createDefaultState();
  const second = core.createDefaultState();

  first.events.push({ id: 'event-1' });

  assert.equal(second.events.length, 0);
  assert.notEqual(first.events, second.events);
  assert.notEqual(first.participantScores, second.participantScores);
});

test('standings rank the lowest total first and use configured event placements to break ties', () => {
  const app = loadApplication();
  const standings = app.evaluate(`
    state = defaultState();
    state.events = [{ id: 'event-1', title: 'Sprint', type: 'individual', scoringType: 'timed' }];
    state.tieBreakerHierarchy = ['event-1'];
    state.participants = [
      { id: 'alex', name: 'Alex' },
      { id: 'blair', name: 'Blair' },
      { id: 'casey', name: 'Casey' }
    ];
    state.participantScores = { alex: 3, blair: 3, casey: 5 };
    state.participantEventCount = { alex: 1, blair: 1, casey: 1 };
    state.participantEventResults = {
      alex: { 'event-1': 2 },
      blair: { 'event-1': 1 },
      casey: { 'event-1': 3 }
    };
    JSON.parse(JSON.stringify(getResolvedStandings()));
  `);

  assert.deepEqual(Array.from(standings, entry => entry.participant), ['Blair', 'Alex', 'Casey']);
});

test('bracket rounds pair every team exactly once and give one bye to an odd field', () => {
  const app = loadApplication();
  const round = app.evaluate(`
    Math.random = () => 0.5;
    JSON.parse(JSON.stringify(buildRound(['a', 'b', 'c', 'd', 'e'], 1)));
  `);

  assert.equal(round.roundNumber, 1);
  assert.equal(round.matches.length, 3);
  assert.equal(round.matches.filter(match => match.bye).length, 1);

  const teamIds = round.matches.flatMap(match => [match.teamAId, match.teamBId]).filter(Boolean);
  assert.deepEqual([...teamIds].sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('the core bracket builder supports deterministic IDs and randomization', () => {
  let nextId = 1;
  const round = core.buildBracketRound(['a', 'b', 'c'], 2, {
    random: () => 0.5,
    makeId: () => `match-${nextId++}`
  });

  assert.equal(round.roundNumber, 2);
  assert.deepEqual(round.matches.map(match => match.id), ['match-1', 'match-2']);
  assert.equal(round.matches.filter(match => match.bye).length, 1);
});

test('the core groups every participant once and distributes leftovers', () => {
  const groups = core.groupParticipants(['a', 'b', 'c', 'd', 'e'], 2, () => 0.5);

  assert.deepEqual(groups.map(group => group.length), [3, 2]);
  assert.deepEqual(groups.flat().sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('the core ranks scored and timed individual results in the correct direction', () => {
  const rows = [
    { participant: 'Alex', value: 12 },
    { participant: 'Blair', value: 8 }
  ];

  assert.deepEqual(
    core.rankIndividualResults(rows, 'scored').map(row => [row.participant, row.points]),
    [['Alex', 1], ['Blair', 2]]
  );
  assert.deepEqual(
    core.rankIndividualResults(rows, 'timed').map(row => [row.participant, row.points]),
    [['Blair', 1], ['Alex', 2]]
  );
  assert.equal(rows[0].points, undefined, 'ranking does not mutate raw result rows');
});

test('equal individual results share competition placement points', () => {
  const ranked = core.rankIndividualResults([
    { participantId: 'alex', value: 12 },
    { participantId: 'blair', value: 12 },
    { participantId: 'casey', value: 8 }
  ], 'scored');

  assert.deepEqual(ranked.map(row => row.points), [1, 1, 3]);
});

test('teams eliminated in the same bracket round share placement points', () => {
  const teams = ['a', 'b', 'c', 'd'].map(id => ({ id, name: `Team ${id}`, memberIds: [`person-${id}`] }));
  const rows = core.buildTeamPlacementRows(teams, {
    championTeamId: 'a',
    eliminationOrder: [
      { teamId: 'c', roundNumber: 1 },
      { teamId: 'd', roundNumber: 1 },
      { teamId: 'b', roundNumber: 2 }
    ]
  });

  assert.deepEqual(rows.map(row => [row.teamId, row.points]), [
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 3]
  ]);
});

test('legacy v2 state migrates to stable IDs and rebuilds derived scores', () => {
  let nextId = 1;
  const migrated = core.normalizeState({
    events: [{ id: 'sprint', title: 'Sprint', type: 'individual', scoringType: 'timed' }],
    tieBreakerHierarchy: ['sprint'],
    participants: ['Alex', 'Blair'],
    eventRawResults: {
      Sprint: [
        { participant: 'Alex', value: 10, raw: '0:10' },
        { participant: 'Blair', value: 12, raw: '0:12' }
      ]
    },
    teamAssignments: {},
    teamBrackets: {}
  }, { makeId: () => `participant-${nextId++}` });

  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.participants, [
    { id: 'participant-1', name: 'Alex' },
    { id: 'participant-2', name: 'Blair' }
  ]);
  assert.equal(migrated.eventRawResults.sprint[0].participantId, 'participant-1');
  assert.equal(migrated.participantScores['participant-1'], 1);
  assert.equal(migrated.participantScores['participant-2'], 2);
});

test('invalid imported structures are rejected without normalization', () => {
  assert.throws(() => core.normalizeState({ events: 'not-a-list' }), /Events must be a list/);
  assert.throws(() => core.normalizeState(null), /JSON object/);
  assert.throws(() => core.normalizeState({ schemaVersion: 99 }), /unsupported schema version/);
  assert.throws(() => core.normalizeState({
    events: [{ id: "bad'id", title: 'Unsafe', type: 'individual' }]
  }), /invalid ID/);
});

test('nested imports reject unknown participants and impossible bracket winners', () => {
  assert.throws(() => core.normalizeState({
    events: [{ id: 'throw', title: 'Throw', type: 'individual', scoringType: 'scored' }],
    participants: [{ id: 'alex', name: 'Alex' }],
    eventRawResults: { throw: [{ participantId: 'missing', value: 10 }] }
  }), /participant who does not exist/);

  assert.throws(() => core.normalizeState({
    events: [{ id: 'teams', title: 'Teams', type: 'team', scoringType: 'bracket', participantsPerTeam: 2 }],
    participants: [
      { id: 'alex', name: 'Alex' },
      { id: 'blair', name: 'Blair' }
    ],
    teamAssignments: {
      teams: [
        { id: 'a', name: 'A', memberIds: ['alex'] },
        { id: 'b', name: 'B', memberIds: ['blair'] }
      ]
    },
    teamBrackets: {
      teams: {
        rounds: [{
          roundNumber: 1,
          matches: [{ id: 'match', teamAId: 'a', teamBId: 'b', winnerId: 'missing', loserId: null }]
        }],
        championTeamId: null
      }
    }
  }), /unknown team/);
});

test('the production page has no inline scripts or inline event handlers', () => {
  const html = readFileSync('index.html', 'utf8');
  const uiScript = readFileSync('app-ui.js', 'utf8');

  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<style>/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.match(html, /script-src 'self'; style-src 'self'/);
  assert.doesNotMatch(uiScript, /window\.(remove|move)/);
});

test('cancelling a validated import leaves the open competition unchanged', () => {
  const app = loadApplication();
  const participantName = app.evaluate(`
    state = defaultState();
    state.participants = [{ id: 'current', name: 'Current Player' }];
    confirm = () => false;
    FileReader = class FileReader {
      readAsText() {
        this.onload({ target: { result: JSON.stringify({
          schemaVersion: 3,
          events: [],
          participants: [{ id: 'imported', name: 'Imported Player' }]
        }) } });
      }
    };
    const input = { files: [{ size: 100 }], value: 'competition.json' };
    importStateFromFile({ target: input });
    state.participants[0].name;
  `);

  assert.equal(participantName, 'Current Player');
});

test('derived totals are rebuilt from canonical results instead of trusted from imported totals', () => {
  const state = core.createDefaultState();
  state.events = [{ id: 'event-1', title: 'Throw', type: 'individual', scoringType: 'scored' }];
  state.participants = [{ id: 'alex', name: 'Alex' }];
  state.eventRawResults['event-1'] = [{ participantId: 'alex', value: 5, raw: '5', points: 1 }];
  state.participantScores.alex = 999;

  core.rebuildDerivedState(state);

  assert.equal(state.participantScores.alex, 1);
  assert.equal(state.participantEventCount.alex, 1);
  assert.equal(state.participantEventResults.alex['event-1'], 1);
});

test('time parsing preserves the production MM:SS.xx behavior', () => {
  const app = loadApplication();

  assert.equal(app.evaluate("validateTimeFormat('02:03.45')"), true);
  assert.equal(app.evaluate("timeToSeconds('02:03.45')"), 123.45);
  assert.equal(app.evaluate("validateTimeFormat('2:3')"), false);
  assert.equal(app.evaluate("validateTimeFormat('02:99')"), false);
});
