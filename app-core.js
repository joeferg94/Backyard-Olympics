(function initializeBackyardOlympicsCore(root, factory) {
  const core = factory();

  if (typeof module === 'object' && module.exports) module.exports = core;
  root.BackyardOlympicsCore = core;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createBackyardOlympicsCore() {
  'use strict';

  const SCHEMA_VERSION = 3;
  const MAX_EVENTS = 500;
  const MAX_PARTICIPANTS = 2000;
  const MAX_TEXT_LENGTH = 200;

  function createDefaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      events: [],
      tieBreakerHierarchy: [],
      participants: [],
      eventRawResults: {},
      teamAssignments: {},
      teamBrackets: {},
      participantScores: {},
      participantEventCount: {},
      participantEventResults: {}
    };
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isSafeId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
  }

  function assertSafeNestedIds(value, path = 'saved data') {
    if (Array.isArray(value)) return value.forEach((entry, index) => assertSafeNestedIds(entry, `${path}[${index}]`));
    if (!isRecord(value)) return;
    Object.entries(value).forEach(([key, entry]) => {
      if ((key === 'id' || key.endsWith('Id')) && entry !== null && !isSafeId(entry)) {
        throw new Error(`${path} contains an invalid ID.`);
      }
      assertSafeNestedIds(entry, `${path}.${key}`);
    });
  }

  function assertImportShape(value) {
    if (!isRecord(value)) throw new Error('Saved competition must be a JSON object.');
    if (value.events !== undefined && !Array.isArray(value.events)) throw new Error('Events must be a list.');
    if (value.participants !== undefined && !Array.isArray(value.participants)) throw new Error('Participants must be a list.');
    if (value.tieBreakerHierarchy !== undefined && !Array.isArray(value.tieBreakerHierarchy)) throw new Error('Tie-breakers must be a list.');
    if (value.eventRawResults !== undefined && !isRecord(value.eventRawResults)) throw new Error('Event results must be an object.');
    if (value.teamAssignments !== undefined && !isRecord(value.teamAssignments)) throw new Error('Team assignments must be an object.');
    if (value.teamBrackets !== undefined && !isRecord(value.teamBrackets)) throw new Error('Team brackets must be an object.');
  }

  function normalizeState(input, options = {}) {
    assertImportShape(input);
    assertSafeNestedIds(input);
    if (Number.isFinite(input.schemaVersion) && input.schemaVersion > SCHEMA_VERSION) {
      throw new Error(`This save uses unsupported schema version ${input.schemaVersion}.`);
    }
    const makeId = options.makeId || (() => createId(options.cryptoApi));
    const state = createDefaultState();
    if ((input.events || []).length > MAX_EVENTS) throw new Error(`A competition cannot contain more than ${MAX_EVENTS} events.`);
    if ((input.participants || []).length > MAX_PARTICIPANTS) throw new Error(`A competition cannot contain more than ${MAX_PARTICIPANTS} participants.`);

    state.events = (input.events || []).map(event => {
      if (!isRecord(event) || typeof event.title !== 'string' || !event.title.trim()) {
        throw new Error('Every event must have a title.');
      }
      if (event.title.trim().length > MAX_TEXT_LENGTH) throw new Error('Event titles must be 200 characters or fewer.');
      if (!['individual', 'team'].includes(event.type)) throw new Error(`Event "${event.title}" has an unsupported type.`);
      if (event.type === 'individual' && !['scored', 'timed'].includes(event.scoringType)) throw new Error(`Event "${event.title}" has an unsupported scoring type.`);
      if (event.type === 'team' && (!Number.isInteger(event.participantsPerTeam) || event.participantsPerTeam < 2 || event.participantsPerTeam > 100)) {
        throw new Error(`Team event "${event.title}" has an invalid team size.`);
      }
      return {
        ...event,
        id: typeof event.id === 'string' && event.id ? event.id : makeId(),
        title: event.title.trim()
      };
    });
    if (new Set(state.events.map(event => event.id)).size !== state.events.length) throw new Error('Event IDs must be unique.');
    if (new Set(state.events.map(event => event.title.toLowerCase())).size !== state.events.length) throw new Error('Event titles must be unique.');

    const participantIdsByName = new Map();
    state.participants = (input.participants || []).map(participant => {
      const name = typeof participant === 'string' ? participant : participant?.name;
      if (typeof name !== 'string' || !name.trim()) throw new Error('Every participant must have a name.');
      if (name.trim().length > MAX_TEXT_LENGTH) throw new Error('Participant names must be 200 characters or fewer.');
      const normalized = {
        id: isRecord(participant) && typeof participant.id === 'string' && participant.id ? participant.id : makeId(),
        name: name.trim()
      };
      participantIdsByName.set(normalized.name, normalized.id);
      return normalized;
    });
    if (new Set(state.participants.map(participant => participant.id)).size !== state.participants.length) throw new Error('Participant IDs must be unique.');
    if (new Set(state.participants.map(participant => participant.name.toLowerCase())).size !== state.participants.length) throw new Error('Participant names must be unique.');

    const participantIdFor = value => {
      if (state.participants.some(participant => participant.id === value)) return value;
      return participantIdsByName.get(value) || null;
    };
    const requiredParticipantIdFor = value => {
      const participantId = participantIdFor(value);
      if (!participantId) throw new Error('Saved data references a participant who does not exist.');
      return participantId;
    };
    const eventByKey = key => state.events.find(event => event.id === key || event.title === key);

    state.tieBreakerHierarchy = (input.tieBreakerHierarchy || [])
      .map(key => eventByKey(key)?.id)
      .filter((id, index, ids) => id && ids.indexOf(id) === index);

    for (const [key, rawTeams] of Object.entries(input.teamAssignments || {})) {
      const event = eventByKey(key);
      if (!event || !Array.isArray(rawTeams)) continue;
      if (rawTeams.length > MAX_PARTICIPANTS) throw new Error(`Event "${event.title}" contains too many teams.`);
      state.teamAssignments[event.id] = rawTeams.map((team, index) => {
        const memberValues = Array.isArray(team) ? team : (team.memberIds || team.members || []);
        if (!Array.isArray(memberValues)) throw new Error(`A team in "${event.title}" has an invalid member list.`);
        const teamName = !Array.isArray(team) && typeof team.name === 'string' ? team.name : `Team ${index + 1}`;
        if (teamName.length > MAX_TEXT_LENGTH) throw new Error('Team names must be 200 characters or fewer.');
        return {
          id: !Array.isArray(team) && typeof team.id === 'string' && team.id ? team.id : makeId(),
          name: teamName,
          memberIds: memberValues.map(requiredParticipantIdFor)
        };
      });
      const teams = state.teamAssignments[event.id];
      if (new Set(teams.map(team => team.id)).size !== teams.length) throw new Error(`Event "${event.title}" contains duplicate team IDs.`);
    }

    for (const [key, bracket] of Object.entries(input.teamBrackets || {})) {
      const event = eventByKey(key);
      if (event && isRecord(bracket)) {
        validateBracket(bracket, state.teamAssignments[event.id] || [], event.title);
        state.teamBrackets[event.id] = structuredCloneValue(bracket);
      }
    }

    for (const [key, rawRows] of Object.entries(input.eventRawResults || {})) {
      const event = eventByKey(key);
      if (!event || !Array.isArray(rawRows)) continue;

      if (event.type === 'individual') {
        const rows = rawRows.map(row => ({
          participantId: requiredParticipantIdFor(row.participantId || row.participant),
          value: Number(row.value),
          raw: row.raw ?? row.value
        })).filter(row => Number.isFinite(row.value));
        state.eventRawResults[event.id] = rankIndividualResults(rows, event.scoringType);
      } else {
        state.eventRawResults[event.id] = rawRows.map((row, index) => ({
          teamId: row.teamId || makeId(),
          teamName: row.teamName || `Team ${index + 1}`,
          memberIds: (row.memberIds || row.members || []).map(requiredParticipantIdFor),
          points: Number.isFinite(row.points) ? row.points : index + 1
        }));
      }
    }

    return rebuildDerivedState(state);
  }

  function validateBracket(bracket, teams, eventTitle) {
    if (!Array.isArray(bracket.rounds) || bracket.rounds.length > 100) throw new Error(`Bracket for "${eventTitle}" has an invalid round list.`);
    const teamIds = new Set(teams.map(team => team.id));
    const optionalTeamId = teamId => teamId === null || teamId === undefined || teamIds.has(teamId);
    bracket.rounds.forEach(round => {
      if (!Number.isInteger(round.roundNumber) || round.roundNumber < 1 || !Array.isArray(round.matches) || round.matches.length > teams.length) {
        throw new Error(`Bracket for "${eventTitle}" contains an invalid round.`);
      }
      round.matches.forEach(match => {
        if (!teamIds.has(match.teamAId) || !optionalTeamId(match.teamBId) || !optionalTeamId(match.winnerId) || !optionalTeamId(match.loserId)) {
          throw new Error(`Bracket for "${eventTitle}" references an unknown team.`);
        }
        if (match.winnerId && ![match.teamAId, match.teamBId].includes(match.winnerId)) {
          throw new Error(`Bracket for "${eventTitle}" contains an impossible winner.`);
        }
      });
    });
    if (!optionalTeamId(bracket.championTeamId)) throw new Error(`Bracket for "${eventTitle}" has an unknown champion.`);
  }

  function structuredCloneValue(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function rebuildDerivedState(state) {
    state.participantScores = {};
    state.participantEventCount = {};
    state.participantEventResults = {};
    state.participants.forEach(participant => {
      state.participantScores[participant.id] = 0;
      state.participantEventCount[participant.id] = 0;
      state.participantEventResults[participant.id] = {};
    });

    state.events.forEach(event => {
      const rows = state.eventRawResults[event.id];
      if (!Array.isArray(rows)) return;
      rows.forEach(row => {
        const participantIds = event.type === 'individual' ? [row.participantId] : (row.memberIds || []);
        participantIds.forEach(participantId => {
          if (!(participantId in state.participantScores) || !Number.isFinite(row.points)) return;
          state.participantScores[participantId] += row.points;
          state.participantEventCount[participantId] += 1;
          state.participantEventResults[participantId][event.id] = row.points;
        });
      });
    });
    state.schemaVersion = SCHEMA_VERSION;
    return state;
  }

  function resolveStandings(state) {
    const standings = state.participants.map(participant => ({
      participantId: participant.id,
      participant: participant.name,
      score: state.participantScores[participant.id] || 0,
      eventCount: state.participantEventCount[participant.id] || 0,
      tieBreakerScores: state.tieBreakerHierarchy.map(eventId => (
        state.participantEventResults[participant.id]?.[eventId] ?? 999
      ))
    }));

    standings.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      for (let index = 0; index < a.tieBreakerScores.length; index += 1) {
        if (a.tieBreakerScores[index] !== b.tieBreakerScores[index]) return a.tieBreakerScores[index] - b.tieBreakerScores[index];
      }
      return a.participant.localeCompare(b.participant);
    });
    return standings;
  }

  function shuffle(values, random = Math.random) {
    return [...values].sort(() => random() - 0.5);
  }

  function groupParticipants(participants, teamSize, random = Math.random) {
    const shuffled = shuffle(participants, random);
    const groups = [];
    while (shuffled.length >= teamSize) groups.push(shuffled.splice(0, teamSize));
    if (shuffled.length) {
      if (!groups.length) groups.push(shuffled.splice(0));
      else shuffled.forEach((participant, index) => groups[index % groups.length].push(participant));
    }
    return groups;
  }

  function rankIndividualResults(rows, scoringType) {
    const ranked = [...rows].sort((a, b) => scoringType === 'timed' ? a.value - b.value : b.value - a.value);
    let previousValue;
    let previousPoints;
    return ranked.map((row, index) => {
      const points = index > 0 && row.value === previousValue ? previousPoints : index + 1;
      previousValue = row.value;
      previousPoints = points;
      return { ...row, points };
    });
  }

  function buildTeamPlacementRows(teams, bracket) {
    const byId = new Map(teams.map(team => [team.id, team]));
    const eliminated = (bracket.eliminationOrder || []).map((entry, index) => (
      typeof entry === 'string' ? { teamId: entry, roundNumber: index + 1 } : entry
    ));
    const maxRound = Math.max(0, ...eliminated.map(entry => entry.roundNumber || 0));
    const groups = [[bracket.championTeamId]];
    for (let round = maxRound; round >= 1; round -= 1) {
      groups.push(eliminated.filter(entry => entry.roundNumber === round).map(entry => entry.teamId));
    }
    let nextPoints = 1;
    const rows = [];
    groups.filter(group => group.length).forEach(group => {
      group.forEach(teamId => {
        const team = byId.get(teamId);
        if (team) rows.push({ teamId, teamName: team.name, memberIds: [...team.memberIds], points: nextPoints });
      });
      nextPoints += group.length;
    });
    return rows;
  }

  function createId(cryptoApi, random = Math.random) {
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    return random().toString(36).substr(2, 9);
  }

  function buildBracketRound(teamIds, roundNumber, options = {}) {
    const random = options.random || Math.random;
    const makeId = options.makeId || (() => createId(options.cryptoApi, random));
    const shuffled = shuffle(teamIds, random);
    const matches = [];
    while (shuffled.length > 1) {
      matches.push({ id: makeId(), teamAId: shuffled.shift(), teamBId: shuffled.shift(), winnerId: null, loserId: null, bye: false });
    }
    if (shuffled.length === 1) {
      matches.push({ id: makeId(), teamAId: shuffled.shift(), teamBId: null, winnerId: null, loserId: null, bye: true });
    }
    return { roundNumber, matches, complete: false };
  }

  function validateTimeFormat(input) {
    return /^(\d+):([0-5]\d)(\.\d{1,2})?$/.test(input.trim());
  }

  function timeToSeconds(input) {
    const match = input.trim().match(/^(\d+):([0-5]\d)(\.\d{1,2})?$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0);
  }

  return Object.freeze({
    SCHEMA_VERSION,
    assertImportShape,
    buildBracketRound,
    buildTeamPlacementRows,
    createDefaultState,
    createId,
    groupParticipants,
    normalizeState,
    rankIndividualResults,
    rebuildDerivedState,
    resolveStandings,
    shuffle,
    timeToSeconds,
    validateTimeFormat
  });
}));
