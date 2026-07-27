    const STORAGE_KEY = 'byo_manager_state_v2';
    const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
    const core = window.BackyardOlympicsCore;

    const defaultState = core.createDefaultState;

    let state = defaultState();

    const el = {
      eventTitle: document.getElementById('eventTitle'),
      eventType: document.getElementById('eventType'),
      scoringType: document.getElementById('scoringType'),
      teamSize: document.getElementById('teamSize'),
      addEventBtn: document.getElementById('addEventBtn'),
      clearAllBtn: document.getElementById('clearAllBtn'),
      eventsTableBody: document.querySelector('#eventsTable tbody'),
      tieBreakerSelect: document.getElementById('tieBreakerSelect'),
      addTieBreakerBtn: document.getElementById('addTieBreakerBtn'),
      clearTieBreakersBtn: document.getElementById('clearTieBreakersBtn'),
      tieBreakerList: document.getElementById('tieBreakerList'),
      participantName: document.getElementById('participantName'),
      addParticipantBtn: document.getElementById('addParticipantBtn'),
      participantList: document.getElementById('participantList'),
      resultEventSelect: document.getElementById('resultEventSelect'),
      resultEntryArea: document.getElementById('resultEntryArea'),
      saveResultsBtn: document.getElementById('saveResultsBtn'),
      generateTeamsBtn: document.getElementById('generateTeamsBtn'),
      createMatchupsBtn: document.getElementById('createMatchupsBtn'),
      saveRoundBtn: document.getElementById('saveRoundBtn'),
      refreshStandingsBtn: document.getElementById('refreshStandingsBtn'),
      standingsTableBody: document.querySelector('#standingsTable tbody'),
      tieInfo: document.getElementById('tieInfo'),
      winnerBox: document.getElementById('winnerBox'),
      exportBtn: document.getElementById('exportBtn'),
      importBtn: document.getElementById('importBtn'),
      importFile: document.getElementById('importFile'),
      saveLocalBtn: document.getElementById('saveLocalBtn'),
      loadLocalBtn: document.getElementById('loadLocalBtn'),
      statEvents: document.getElementById('statEvents'),
      statParticipants: document.getElementById('statParticipants'),
      statTieBreakers: document.getElementById('statTieBreakers'),
      statCompleted: document.getElementById('statCompleted')
    };

    el.eventType.addEventListener('change', () => {
      const isTeam = el.eventType.value === 'team';
      el.teamSize.disabled = !isTeam;
      el.scoringType.disabled = isTeam;
    });
    el.eventType.dispatchEvent(new Event('change'));

    el.addEventBtn.addEventListener('click', addEvent);
    el.addTieBreakerBtn.addEventListener('click', addTieBreaker);
    el.clearTieBreakersBtn.addEventListener('click', () => {
      state.tieBreakerHierarchy = [];
      syncAll();
    });
    el.addParticipantBtn.addEventListener('click', addParticipant);
    el.resultEventSelect.addEventListener('change', renderResultInputs);
    el.saveResultsBtn.addEventListener('click', saveResultsForEvent);
    el.generateTeamsBtn.addEventListener('click', generateRandomTeams);
    el.createMatchupsBtn.addEventListener('click', createTeamMatchups);
    el.saveRoundBtn.addEventListener('click', saveTeamRound);
    el.refreshStandingsBtn.addEventListener('click', renderStandings);
    el.exportBtn.addEventListener('click', exportState);
    el.importBtn.addEventListener('click', () => el.importFile.click());
    el.importFile.addEventListener('change', importStateFromFile);
    el.saveLocalBtn.addEventListener('click', saveToBrowser);
    el.loadLocalBtn.addEventListener('click', loadFromBrowser);
    el.clearAllBtn.addEventListener('click', resetEverything);
    el.participantName.addEventListener('keydown', e => { if (e.key === 'Enter') addParticipant(); });
    el.eventTitle.addEventListener('keydown', e => { if (e.key === 'Enter') addEvent(); });
    el.eventsTableBody.addEventListener('click', event => handleActionClick(event, {
      removeEvent: id => removeEventById(id)
    }));
    el.tieBreakerList.addEventListener('click', event => handleActionClick(event, {
      removeTieBreaker: id => removeTieBreakerById(id),
      moveTieBreaker: (id, button) => moveTieBreaker(id, Number(button.dataset.direction))
    }));
    el.participantList.addEventListener('click', event => handleActionClick(event, {
      removeParticipant: id => removeParticipantById(id)
    }));

    function handleActionClick(event, actions) {
      const button = event.target.closest('button[data-action]');
      if (!button || !event.currentTarget.contains(button)) return;
      actions[button.dataset.action]?.(button.dataset.id, button);
    }

    function addEvent() {
      const title = el.eventTitle.value.trim();
      if (!title) return alert('Enter an event title.');
      if (state.events.some(evt => evt.title.toLowerCase() === title.toLowerCase())) {
        return alert('Event titles must be unique.');
      }

      const isTeam = el.eventType.value === 'team';
      const evt = {
        id: makeId(),
        title,
        type: el.eventType.value,
        scoringType: isTeam ? 'bracket' : el.scoringType.value,
        participantsPerTeam: isTeam ? Math.max(2, Number(el.teamSize.value || 2)) : null
      };

      state.events.push(evt);
      el.eventTitle.value = '';
      syncAll();
    }

    function addTieBreaker() {
      const eventId = el.tieBreakerSelect.value;
      if (!eventId) return;
      if (state.tieBreakerHierarchy.includes(eventId)) {
        return alert('That event is already in the tie-breaker hierarchy.');
      }
      state.tieBreakerHierarchy.push(eventId);
      syncAll();
    }

    function addParticipant() {
      const name = el.participantName.value.trim();
      if (!name) return alert('Enter a participant name.');
      if (state.participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        return alert('Participant already exists.');
      }
      state.participants.push({ id: makeId(), name });
      core.rebuildDerivedState(state);
      el.participantName.value = '';
      syncAll();
    }

    function renderEvents() {
      el.eventsTableBody.innerHTML = '';
      if (state.events.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="7" class="muted">No events added yet.</td>';
        el.eventsTableBody.appendChild(tr);
        return;
      }

      state.events.forEach((evt, index) => {
        const complete = eventHasSavedResults(evt.id);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${index + 1}</td>
          <td>${escapeHtml(evt.title)}</td>
          <td>${evt.type}</td>
          <td>${evt.type === 'team' ? 'Bracket' : evt.scoringType}</td>
          <td>${evt.participantsPerTeam ?? 'N/A'}</td>
          <td>${complete ? 'Complete' : 'Pending'}</td>
          <td>
            <div class="btn-row">
              <button class="small danger" data-action="removeEvent" data-id="${evt.id}">Remove</button>
            </div>
          </td>
        `;
        el.eventsTableBody.appendChild(tr);
      });
    }

    function renderTieBreakerOptions() {
      el.tieBreakerSelect.innerHTML = '<option value="">Select event</option>';
      state.events
        .filter(evt => !state.tieBreakerHierarchy.includes(evt.id))
        .forEach(evt => {
          const opt = document.createElement('option');
          opt.value = evt.id;
          opt.textContent = evt.title;
          el.tieBreakerSelect.appendChild(opt);
        });
    }

    function renderTieBreakerList() {
      el.tieBreakerList.innerHTML = '';
      if (state.tieBreakerHierarchy.length === 0) {
        el.tieBreakerList.innerHTML = '<div class="empty" style="width:100%">No tie-breakers set yet.</div>';
        return;
      }
      state.tieBreakerHierarchy.forEach((id, index) => {
        const evt = state.events.find(e => e.id === id);
        if (!evt) return;
        const div = document.createElement('div');
        div.className = 'pill';
        div.innerHTML = `
          <strong>${index + 1}.</strong> ${escapeHtml(evt.title)}
          <button class="small danger" data-action="removeTieBreaker" data-id="${id}">Remove</button>
          ${index > 0 ? `<button class="small ghost" data-action="moveTieBreaker" data-id="${id}" data-direction="-1">↑</button>` : ''}
          ${index < state.tieBreakerHierarchy.length - 1 ? `<button class="small ghost" data-action="moveTieBreaker" data-id="${id}" data-direction="1">↓</button>` : ''}
        `;
        el.tieBreakerList.appendChild(div);
      });
    }

    function renderParticipants() {
      el.participantList.innerHTML = '';
      if (state.participants.length === 0) {
        el.participantList.innerHTML = '<div class="empty" style="width:100%">No participants yet.</div>';
        return;
      }
      state.participants.forEach(participant => {
        const div = document.createElement('div');
        div.className = 'pill';
        const name = document.createTextNode(participant.name + ' ');
        const button = document.createElement('button');
        button.className = 'small danger';
        button.dataset.action = 'removeParticipant';
        button.dataset.id = participant.id;
        button.textContent = 'Remove';
        div.appendChild(name);
        div.appendChild(button);
        el.participantList.appendChild(div);
      });
    }

    function renderResultEventOptions() {
      const current = el.resultEventSelect.value;
      el.resultEventSelect.innerHTML = '<option value="">Select event</option>';
      state.events.forEach(evt => {
        const opt = document.createElement('option');
        opt.value = evt.id;
        opt.textContent = evt.title;
        el.resultEventSelect.appendChild(opt);
      });
      if (state.events.some(e => e.id === current)) el.resultEventSelect.value = current;
    }

    function renderResultInputs() {
      el.resultEntryArea.innerHTML = '';
      const evt = getSelectedEvent();
      if (!evt) {
        el.resultEntryArea.innerHTML = '<div class="empty">Select an event to record results.</div>';
        toggleTeamButtons(false);
        return;
      }
      if (state.participants.length === 0) {
        el.resultEntryArea.innerHTML = '<div class="empty">Add participants first.</div>';
        toggleTeamButtons(evt.type === 'team');
        return;
      }

      toggleTeamButtons(evt.type === 'team');

      if (evt.type === 'individual') {
        const msg = document.createElement('div');
        msg.className = 'notice';
        msg.innerHTML = evt.scoringType === 'timed'
          ? 'Enter times like <strong>2:05</strong> or <strong>2:05.50</strong>. Lower time wins.'
          : 'Enter numeric scores. Higher score wins.';
        el.resultEntryArea.appendChild(msg);

        const previous = getPreviousRawResults(evt.id);
        state.participants.forEach(participant => {
          const label = document.createElement('label');
          label.textContent = `${participant.name} - Result`;
          const input = document.createElement('input');
          input.placeholder = evt.scoringType === 'timed' ? 'MM:SS.xx' : 'Score';
          input.setAttribute('data-participant-id', participant.id);
          const prev = previous.find(x => x.participantId === participant.id);
          if (prev) input.value = prev.raw ?? prev.value ?? '';
          el.resultEntryArea.appendChild(label);
          el.resultEntryArea.appendChild(input);
        });
        return;
      }

      const wrap = document.createElement('div');
      const teams = state.teamAssignments[evt.id] || [];
      const bracket = state.teamBrackets[evt.id] || null;
      const complete = eventHasSavedResults(evt.id);

      const info = document.createElement('div');
      info.className = 'notice';
      info.innerHTML = 'Team event flow: <strong>Generate Random Teams</strong> → <strong>Create Matchups</strong> → choose winners → <strong>Save Team Round</strong>. Repeat until champion crowned.';
      wrap.appendChild(info);

      if (teams.length === 0) {
        wrap.innerHTML += '<div class="empty">No teams generated yet. Click <strong>Generate Random Teams</strong> to start.</div>';
        el.resultEntryArea.appendChild(wrap);
        return;
      }

      const teamsBox = document.createElement('div');
      teamsBox.className = 'team-box';
      teamsBox.innerHTML = '<strong>Teams</strong>';
      teams.forEach((team, index) => {
        const div = document.createElement('div');
        div.className = 'round-summary';
        div.innerHTML = `<strong>Team ${index + 1}</strong>: ${escapeHtml(participantNames(team.memberIds))}`;
        teamsBox.appendChild(div);
      });
      wrap.appendChild(teamsBox);

      if (!bracket) {
        wrap.innerHTML += '<div class="empty">Teams ready. Click <strong>Create Matchups</strong> to build bracket.</div>';
        el.resultEntryArea.appendChild(wrap);
        return;
      }

      const round = getCurrentRound(bracket);
      if (!round) {
        if (complete) {
          const placements = getPreviousRawResults(evt.id);
          const summary = document.createElement('div');
          summary.className = 'success-box';
          summary.innerHTML = `<strong>✅ Tournament Complete!</strong><br>Champion: ${escapeHtml(bracket.championName || 'Unknown')}`;
          wrap.appendChild(summary);
          if (placements.length) {
            const placeBox = document.createElement('div');
            placeBox.className = 'team-box';
            placeBox.innerHTML = '<strong>Final Placements</strong>';
            placements.forEach((row, i) => {
              const div = document.createElement('div');
              div.className = 'round-summary';
              div.innerHTML = `${formatPlacement(row.points)}. ${escapeHtml(row.teamName)} (${escapeHtml(participantNames(row.memberIds))})`;
              placeBox.appendChild(div);
            });
            wrap.appendChild(placeBox);
          }
        } else {
          wrap.innerHTML += '<div class="empty">No active round.</div>';
        }
        el.resultEntryArea.appendChild(wrap);
        return;
      }

      const roundHeader = document.createElement('div');
      roundHeader.className = 'success-box';
      roundHeader.innerHTML = `<strong>Round ${round.roundNumber}</strong> (${round.matches.length} matches)`;
      wrap.appendChild(roundHeader);

      const matchGrid = document.createElement('div');
      matchGrid.className = 'match-grid';

      round.matches.forEach((match, index) => {
        const box = document.createElement('div');
        box.className = 'match-box';
        const teamA = getTeamById(evt.id, match.teamAId);
        const teamB = getTeamById(evt.id, match.teamBId);

        if (match.bye) {
          box.innerHTML = `
            <div class="match-title">Match ${index + 1}</div>
            <div><strong>${escapeHtml(teamA?.name || 'Unknown')}</strong></div>
            <div class="subtle">${escapeHtml(participantNames(teamA?.memberIds))}</div>
            <div class="bye-badge">🎉 Bye to next round</div>
          `;
        } else {
          box.innerHTML = `
            <div class="match-title">Match ${index + 1}</div>
            <div><strong>${escapeHtml(teamA?.name || 'Team A')}</strong></div>
            <div class="subtle">${escapeHtml(participantNames(teamA?.memberIds))}</div>
            <div style="margin:8px 0;font-weight:700;text-align:center;">⚔ VS ⚔</div>
            <div><strong>${escapeHtml(teamB?.name || 'Team B')}</strong></div>
            <div class="subtle">${escapeHtml(participantNames(teamB?.memberIds))}</div>
            <label for="winner_${match.id}" style="margin-top:10px;">👑 Select Winner</label>
            <select id="winner_${match.id}" data-match-id="${match.id}">
              <option value="">Choose winner...</option>
              <option value="${match.teamAId}" ${match.winnerId === match.teamAId ? 'selected' : ''}>${escapeHtml(teamA?.name || 'Team A')}</option>
              <option value="${match.teamBId}" ${match.winnerId === match.teamBId ? 'selected' : ''}>${escapeHtml(teamB?.name || 'Team B')}</option>
            </select>
          `;
        }
        matchGrid.appendChild(box);
      });

      wrap.appendChild(matchGrid);

      const summary = document.createElement('div');
      summary.className = 'round-summary';
      summary.innerHTML = `Rounds completed: <strong>${bracket.completedRounds.length}</strong> | ${complete ? '✅ Event finished' : '👉 Select winners and save round'}`;
      wrap.appendChild(summary);

      el.resultEntryArea.appendChild(wrap);
    }

    function toggleTeamButtons(isTeamEvent) {
      el.generateTeamsBtn.style.display = isTeamEvent ? 'inline-block' : 'none';
      el.createMatchupsBtn.style.display = isTeamEvent ? 'inline-block' : 'none';
      el.saveRoundBtn.style.display = isTeamEvent ? 'inline-block' : 'none';
      el.saveResultsBtn.style.display = isTeamEvent ? 'none' : 'inline-block';
    }

    function generateRandomTeams() {
      const evt = getSelectedEvent();
      if (!evt) return alert('Select a team event first.');
      if (evt.type !== 'team') return alert('Only for team events.');
      if (state.participants.length < evt.participantsPerTeam) return alert(`Need at least ${evt.participantsPerTeam} participants.`);

      resetEventImpact(evt.id);
      delete state.teamBrackets[evt.id];

      const size = evt.participantsPerTeam;
      const groups = core.groupParticipants(state.participants.map(participant => participant.id), size);

      state.teamAssignments[evt.id] = groups.map((memberIds, index) => ({
        id: makeId(),
        name: `Team ${index + 1}`,
        memberIds: [...memberIds]
      }));

      alert(`✅ Generated ${groups.length} teams!`);
      syncAll();
    }

    function createTeamMatchups() {
      const evt = getSelectedEvent();
      if (!evt || evt.type !== 'team') return alert('Select a team event first.');
      const teams = state.teamAssignments[evt.id] || [];
      if (teams.length < 2) return alert('Need at least 2 teams.');

      resetEventImpact(evt.id);

      state.teamBrackets[evt.id] = {
        rounds: [buildRound(teams.map(t => t.id), 1)],
        completedRounds: [],
        eliminationOrder: [],
        championTeamId: null,
        championName: null
      };

      alert('✅ Bracket created! Ready for Round 1.');
      syncAll();
    }

    function buildRound(teamIds, roundNumber) {
      return core.buildBracketRound(teamIds, roundNumber, { makeId });
    }

    function getCurrentRound(bracket) {
      return bracket.rounds.find(r => !r.complete) || null;
    }

    function saveTeamRound() {
      const evt = getSelectedEvent();
      if (!evt || evt.type !== 'team') return alert('Select a team event.');
      const bracket = state.teamBrackets[evt.id];
      if (!bracket) return alert('Create matchups first.');
      if (eventHasSavedResults(evt.id)) return alert('Event already complete.');

      const round = getCurrentRound(bracket);
      if (!round) return alert('No active round.');

      const advancing = [];
      const eliminatedThisRound = [];

      for (const match of round.matches) {
        if (match.bye) {
          match.winnerId = match.teamAId;
          advancing.push(match.teamAId);
          continue;
        }

        const select = document.querySelector(`[data-match-id="${match.id}"]`);
        const winnerId = select ? select.value.trim() : '';
        if (!winnerId) {
          const matchNum = round.matches.indexOf(match) + 1;
          return alert(`⚠️ Select winner for Match ${matchNum}`);
        }
        if (winnerId !== match.teamAId && winnerId !== match.teamBId) return alert('Invalid winner.');

        match.winnerId = winnerId;
        match.loserId = winnerId === match.teamAId ? match.teamBId : match.teamAId;
        advancing.push(match.winnerId);
        eliminatedThisRound.push(match.loserId);
      }

      round.complete = true;
      bracket.completedRounds.push(round.roundNumber);
      bracket.eliminationOrder.push(...eliminatedThisRound.map(teamId => ({ teamId, roundNumber: round.roundNumber })));

      if (advancing.length === 1) {
        bracket.championTeamId = advancing[0];
        const championTeam = getTeamById(evt.id, advancing[0]);
        bracket.championName = championTeam?.name || 'Champion';
        finalizeTeamEvent(evt, bracket);
        syncAll();
        alert('🏆 TOURNAMENT COMPLETE!\n\nChampion: ' + bracket.championName);
      } else {
        bracket.rounds.push(buildRound(advancing, round.roundNumber + 1));
        syncAll();
        alert(`✅ Round ${round.roundNumber} saved!\n${advancing.length} teams advance to Round ${round.roundNumber + 1}`);
      }
    }

    function finalizeTeamEvent(evt, bracket) {
      resetEventImpact(evt.id);
      const teams = state.teamAssignments[evt.id] || [];
      state.eventRawResults[evt.id] = core.buildTeamPlacementRows(teams, bracket);
      core.rebuildDerivedState(state);
    }

    function saveResultsForEvent() {
      const evt = getSelectedEvent();
      if (!evt) return alert('Select an event.');
      if (evt.type === 'team') return alert('Use matchups for team events.');
      if (state.participants.length === 0) return alert('Add participants first.');

      resetEventImpact(evt.id);

      const rows = [];
      for (const participant of state.participants) {
        const input = document.querySelector(`[data-participant-id="${participant.id}"]`);
        const raw = input ? input.value.trim() : '';
        if (!raw) continue;
        let value;
        if (evt.scoringType === 'timed') {
          if (!validateTimeFormat(raw)) return alert(`Invalid time for ${participant.name}. Use MM:SS or MM:SS.xx`);
          value = timeToSeconds(raw);
        } else {
          value = parseFloat(raw);
          if (!Number.isFinite(value)) return alert(`Invalid score for ${participant.name}.`);
        }
        rows.push({ participantId: participant.id, value, raw });
      }
      if (rows.length === 0) return alert('Enter at least one result.');

      const rankedRows = core.rankIndividualResults(rows, evt.scoringType);
      state.eventRawResults[evt.id] = rankedRows;
      core.rebuildDerivedState(state);

      syncAll();
      alert('✅ Results saved!');
    }

    function renderStandings() {
      el.standingsTableBody.innerHTML = '';
      el.tieInfo.innerHTML = '';

      if (state.participants.length === 0) {
        el.standingsTableBody.innerHTML = '<tr><td colspan="5" class="muted">No participants yet.</td></tr>';
        el.winnerBox.className = 'empty';
        el.winnerBox.textContent = 'No standings yet.';
        return;
      }

      const standings = getResolvedStandings();
      standings.forEach((entry, index) => {
        const tr = document.createElement('tr');
        const tieBreakText = entry.tieBreakerScores.length
          ? entry.tieBreakerScores.map((s, i) => `TB${i + 1}: ${s === 999 ? '—' : s}`).join(' | ')
          : '—';
        tr.innerHTML = `
          <td>${index + 1}</td>
          <td>${escapeHtml(entry.participant)}</td>
          <td>${entry.eventCount}</td>
          <td><strong>${entry.score}</strong></td>
          <td>${escapeHtml(tieBreakText)}</td>
        `;
        el.standingsTableBody.appendChild(tr);
      });

      if (standings.length > 0) {
        el.winnerBox.className = 'success-box';
        el.winnerBox.innerHTML = `🏆 <strong>${escapeHtml(standings[0].participant)}</strong> leads!`;
      }
    }

    function getResolvedStandings() {
      return core.resolveStandings(state);
    }

    function exportState() {
      const data = JSON.stringify(state, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backyard-olympics.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    function importStateFromFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_IMPORT_BYTES) {
        alert('❌ This file is too large. Choose a competition file smaller than 5 MB.');
        event.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          const migrated = core.normalizeState(imported, { makeId });
          const completed = migrated.events.filter(eventItem => migrated.eventRawResults[eventItem.id]?.length).length;
          const summary = `Import this competition?\n\nParticipants: ${migrated.participants.length}\nEvents: ${migrated.events.length}\nCompleted events: ${completed}\nSave version: ${migrated.schemaVersion}\n\nThis will replace the competition currently open.`;
          if (!confirm(summary)) return;
          state = migrated;
          syncAll();
          alert('✅ Imported successfully!');
        } catch (error) {
          alert(`❌ Import failed: ${error.message || 'Invalid competition file.'}`);
        } finally {
          event.target.value = '';
        }
      };
      reader.onerror = () => alert('❌ Import failed: the file could not be read.');
      reader.readAsText(file);
    }

    function saveToBrowser() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      alert('✅ Saved to browser!');
    }

    function loadFromBrowser() {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return alert('No saved data found.');
      try {
        state = core.normalizeState(JSON.parse(saved), { makeId });
        syncAll();
        alert('✅ Loaded from browser!');
      } catch {
        alert('❌ Corrupted data.');
      }
    }

    function resetEverything() {
      if (!confirm('🚨 Reset EVERYTHING? Cannot undo!')) return;
      state = defaultState();
      syncAll();
      alert('✅ Reset complete.');
    }

    function removeEventById(id) {
      const evt = state.events.find(e => e.id === id);
      if (!evt) return;
      if (!confirm(`Remove event "${evt.title}"?`)) return;
      resetEventImpact(evt.id);
      state.events = state.events.filter(e => e.id !== id);
      state.tieBreakerHierarchy = state.tieBreakerHierarchy.filter(tid => tid !== id);
      delete state.teamAssignments[id];
      delete state.teamBrackets[id];
      syncAll();
    }

    function removeTieBreakerById(id) {
      state.tieBreakerHierarchy = state.tieBreakerHierarchy.filter(tid => tid !== id);
      syncAll();
    }

    function removeParticipantById(id) {
      const participant = state.participants.find(candidate => candidate.id === id);
      if (!participant || !confirm(`Remove "${participant.name}"? Team brackets involving this participant will be reset.`)) return;
      state.participants = state.participants.filter(candidate => candidate.id !== id);
      state.events.forEach(event => {
        if (event.type === 'individual') {
          state.eventRawResults[event.id] = (state.eventRawResults[event.id] || []).filter(row => row.participantId !== id);
        } else if ((state.teamAssignments[event.id] || []).some(team => team.memberIds.includes(id))) {
          state.teamAssignments[event.id] = (state.teamAssignments[event.id] || [])
            .map(team => ({ ...team, memberIds: team.memberIds.filter(memberId => memberId !== id) }))
            .filter(team => team.memberIds.length);
          delete state.teamBrackets[event.id];
          delete state.eventRawResults[event.id];
        }
      });
      core.rebuildDerivedState(state);
      syncAll();
    }

    function moveTieBreaker(id, direction) {
      const idx = state.tieBreakerHierarchy.indexOf(id);
      if (idx < 0) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= state.tieBreakerHierarchy.length) return;
      [state.tieBreakerHierarchy[idx], state.tieBreakerHierarchy[newIdx]] = [state.tieBreakerHierarchy[newIdx], state.tieBreakerHierarchy[idx]];
      syncAll();
    }

    function resetEventImpact(eventId) {
      delete state.eventRawResults[eventId];
      core.rebuildDerivedState(state);
    }

    function eventHasSavedResults(eventId) {
      return !!(state.eventRawResults[eventId] && state.eventRawResults[eventId].length);
    }

    function getPreviousRawResults(eventId) {
      return state.eventRawResults[eventId] || [];
    }

    function getSelectedEvent() {
      return state.events.find(e => e.id === el.resultEventSelect.value) || null;
    }

    function getTeamById(eventId, teamId) {
      return (state.teamAssignments[eventId] || []).find(t => t.id === teamId) || null;
    }

    function participantNames(participantIds = []) {
      return participantIds
        .map(id => state.participants.find(participant => participant.id === id)?.name)
        .filter(Boolean)
        .join(', ');
    }

    function formatPlacement(points) {
      return points || '—';
    }

    function validateTimeFormat(input) {
      return core.validateTimeFormat(input);
    }

    function timeToSeconds(input) {
      return core.timeToSeconds(input);
    }

    function escapeHtml(text) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    function cssEscape(str) {
      return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function makeId() {
      return core.createId(window.crypto);
    }

    function syncAll() {
      core.rebuildDerivedState(state);
      renderEvents();
      renderTieBreakerOptions();
      renderTieBreakerList();
      renderParticipants();
      renderResultEventOptions();
      renderResultInputs();
      renderStandings();
      updateStats();
    }

    function updateStats() {
      el.statEvents.textContent = state.events.length;
      el.statParticipants.textContent = state.participants.length;
      el.statTieBreakers.textContent = state.tieBreakerHierarchy.length;
      const completed = state.events.filter(evt => eventHasSavedResults(evt.id)).length;
      el.statCompleted.textContent = completed;
    }

    loadFromBrowser();
    syncAll();
