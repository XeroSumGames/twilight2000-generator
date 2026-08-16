/* Twilight: 2000 4th Edition creation engine -- the LIFE PATH method (printed p31).
   Pure logic, no DOM. The UI owns what is asked next; this file owns what is legal.

   The book's own 21-step order is followed exactly. Where a step is a table decision
   rather than a personal one (group gear, buddy, how you met) the engine records the
   answer but rolls nothing.
*/
(function (root) {
  'use strict';

  // ---------- deterministic RNG (seedable so life paths can be replayed) ----------
  function RNG(seed) {
    this.s = (seed >>> 0) || 1;
  }
  RNG.prototype.next = function () {
    var x = this.s;                       // xorshift32
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;  x >>>= 0;
    this.s = x;
    return x / 4294967296;
  };
  RNG.prototype.die = function (n) { return Math.floor(this.next() * n) + 1; };
  RNG.prototype.d3 = function () { return this.die(3); };
  RNG.prototype.d6 = function () { return this.die(6); };
  RNG.prototype.d8 = function () { return this.die(8); };
  RNG.prototype.d2d3 = function () { return this.d3() + this.d3(); };
  RNG.prototype.pick = function (a) { return a[Math.floor(this.next() * a.length)]; };

  // ---------- the A-D ladder ----------
  // F is "untrained" and only ever applies to skills. Attributes run A..D.
  var RANKED = ['F', 'D', 'C', 'B', 'A'];
  var DIE_SIZE = { A: 12, B: 10, C: 8, D: 6, F: 0 };

  function rank(level) { var i = RANKED.indexOf(level); return i < 0 ? 0 : i; }
  function levelAt(i) { return RANKED[Math.max(0, Math.min(RANKED.length - 1, i))]; }
  function dieSize(level) { return DIE_SIZE[level] || 0; }
  function atLeast(level, min) { return rank(level) >= rank(min); }
  function stepUp(level, n) { return levelAt(rank(level) + (n === undefined ? 1 : n)); }
  function stepDown(level, n) { return levelAt(rank(level) - (n === undefined ? 1 : n)); }

  var ATTRS = ['STR', 'AGL', 'INT', 'EMP'];

  // ---------- state ----------
  function newState(DATA, seed) {
    return {
      DATA: DATA,
      rng: new RNG(seed),
      seed: seed,

      name: '', nickname: '', nationality: '', localMilitia: false,

      attrs: { STR: 'C', AGL: 'C', INT: 'C', EMP: 'C' },
      attrIncreasesLeft: 0,
      tradedDown: null,          // the attribute dropped C -> D for a bonus increase

      skills: {},                // name -> 'D'|'C'|'B'|'A'; absent means F (untrained)
      specialties: [],           // names, in the order gained
      cuf: 'D',
      age: 18,

      childhood: null,
      rankIndex: -1,             // index into DATA.core.ranks.ladder; -1 = civilian, no rank
      terms: [],                 // append-only history
      current: null,             // the term being played
      careerTermCount: {},       // by career key
      groupTermCount: {},        // by group key (military, education, ...)

      war: false,
      atWar: null,               // the At War term once played
      prisonNext: false,         // set by the Crime prison rule

      gear: [], rations: 0, water: 0, ammo: 0, rads: 0,
      moralCode: '', bigDream: '', buddy: '', howMet: '', appearance: '',

      log: [],
      done: false
    };
  }

  function start(DATA, seed) {
    var S = newState(DATA, seed);
    S.attrIncreasesLeft = S.rng.d2d3();     // step 3: 2D3 increases over a baseline of C
    S.log.push('2D3 attribute increases: ' + S.attrIncreasesLeft);
    return S;
  }

  // ---------- step 3: attributes ----------
  function canRaiseAttr(S, a) {
    return S.attrIncreasesLeft > 0 && rank(S.attrs[a]) < rank('A');
  }
  function raiseAttr(S, a) {
    if (!canRaiseAttr(S, a)) return false;
    S.attrs[a] = stepUp(S.attrs[a]);
    S.attrIncreasesLeft--;
    return true;
  }
  function lowerAttr(S, a) {
    // Undo an increase, back down toward the C baseline (or D if this is the traded one).
    var floor = (S.tradedDown === a) ? 'D' : 'C';
    if (rank(S.attrs[a]) <= rank(floor)) return false;
    S.attrs[a] = stepDown(S.attrs[a]);
    S.attrIncreasesLeft++;
    return true;
  }
  // "You can gain one extra increase by decreasing one attribute from C to D."
  function tradeDown(S, a) {
    if (S.tradedDown) return false;
    if (S.attrs[a] !== 'C') return false;
    S.attrs[a] = 'D';
    S.tradedDown = a;
    S.attrIncreasesLeft++;
    return true;
  }
  function undoTradeDown(S) {
    if (!S.tradedDown || S.attrIncreasesLeft < 1) return false;
    S.attrs[S.tradedDown] = 'C';
    S.tradedDown = null;
    S.attrIncreasesLeft--;
    return true;
  }

  // ---------- skills ----------
  function skillLevel(S, name) { return S.skills[name] || 'F'; }
  function canRaiseSkill(S, name) { return rank(skillLevel(S, name)) < rank('A'); }
  function raiseSkill(S, name) {
    if (!canRaiseSkill(S, name)) return false;
    S.skills[name] = stepUp(skillLevel(S, name));   // F -> D on first take
    return true;
  }
  function lowerSkill(S, name) {
    var cur = skillLevel(S, name);
    if (cur === 'F') return false;
    var next = stepDown(cur);
    if (next === 'F') delete S.skills[name]; else S.skills[name] = next;
    return true;
  }
  function skillAttr(S, name) {
    var list = S.DATA.skills.skills;
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i].attr;
    return 'INT';
  }

  // A skill roll is the skill die plus the attribute die; 6+ on either is a success,
  // 10+ on one die counts as two. Untrained rolls the attribute die alone (printed p44).
  function skillRoll(S, name) {
    var a = skillAttr(S, name);
    var dice = [dieSize(S.attrs[a])];
    var sl = skillLevel(S, name);
    if (sl !== 'F') dice.push(dieSize(sl));
    var rolls = [], succ = 0;
    for (var i = 0; i < dice.length; i++) {
      var r = S.rng.die(dice[i]);
      rolls.push({ die: dice[i], roll: r });
      if (r >= 10) succ += 2; else if (r >= 6) succ += 1;
    }
    return { skill: name, attr: a, dice: dice, rolls: rolls, successes: succ, ok: succ > 0 };
  }

  // ---------- careers ----------
  function allGroups(S) {
    var out = [{
      key: S.DATA.military.key, name: S.DATA.military.name, type: S.DATA.military.type,
      blurb: S.DATA.military.blurb, careers: S.DATA.military.careers
    }];
    var g = S.DATA.civilian.groups;
    for (var i = 0; i < g.length; i++) out.push(g[i]);
    return out;
  }
  function findCareer(S, key) {
    var gs = allGroups(S);
    for (var i = 0; i < gs.length; i++) {
      for (var j = 0; j < gs[i].careers.length; j++) {
        if (gs[i].careers[j].key === key) return { group: gs[i], career: gs[i].careers[j] };
      }
    }
    return null;
  }

  function meets(S, career, group) {
    var r = career.requirements || {};
    var fails = [];
    if (r.all) for (var i = 0; i < r.all.length; i++) {
      if (!atLeast(S.attrs[r.all[i].attr], r.all[i].min)) fails.push(r.all[i].attr + ' ' + r.all[i].min + '+');
    }
    if (r.any) {
      var okAny = false;
      for (var k = 0; k < r.any.length; k++) if (atLeast(S.attrs[r.any[k].attr], r.any[k].min)) okAny = true;
      if (!okAny) fails.push(r.text);
    }
    if (r.max) for (var m = 0; m < r.max.length; m++) {
      if (rank(S.attrs[r.max[m].attr]) > rank(r.max[m].max)) fails.push(r.max[m].attr + ' ' + r.max[m].max + ' or lower');
    }
    if (r.no_d_attribute) {
      for (var a = 0; a < ATTRS.length; a++) if (S.attrs[ATTRS[a]] === 'D') { fails.push('no D attribute'); break; }
    }
    if (r.terms_in) {
      var need = r.terms_in.min || 1;
      var have = r.terms_in.career ? (S.careerTermCount[r.terms_in.career] || 0)
                                   : (S.groupTermCount[r.terms_in.group] || 0);
      if (have < need) fails.push(need + ' term' + (need === 1 ? '' : 's') + ' in ' +
        (r.terms_in.career || r.terms_in.group));
    }
    if (r.forbid_terms_in) {
      var bad = S.careerTermCount[r.forbid_terms_in.career] || 0;
      if (bad > 0) fails.push('no terms as ' + r.forbid_terms_in.career);
    }
    // "OFFICERS must qualify for BOTH the Officer career path and the functional area
    // in which they want to serve" (printed p32) -- so Officer is only open when at
    // least one functional area is itself open.
    if (career.key === 'officer' && !fails.length && !officerAreas(S).length) {
      fails.push('a functional area to serve in');
    }
    return { ok: fails.length === 0, fails: fails };
  }

  // The four functional areas an officer may serve in, filtered to the ones they qualify
  // for. Officer itself is excluded -- an officer serves in an area, not in "Officer".
  function officerAreas(S) {
    var out = [];
    var cs = S.DATA.military.careers;
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].key === 'officer') continue;
      if (meets(S, cs[i], S.DATA.military).ok) out.push(cs[i]);
    }
    return out;
  }

  function careerOptions(S) {
    var out = [];
    var gs = allGroups(S);
    for (var i = 0; i < gs.length; i++) {
      for (var j = 0; j < gs[i].careers.length; j++) {
        var c = gs[i].careers[j];
        var m = meets(S, c, gs[i]);
        out.push({ group: gs[i], career: c, ok: m.ok, fails: m.fails });
      }
    }
    return out;
  }

  // ---------- the term ----------
  function isFirstMilitaryTerm(S) { return (S.groupTermCount.military || 0) === 0; }
  function isNCO(S) { return S.rankIndex >= 2; }   // Corporal / Specialist or above

  // Skills a term may raise: the career's own list, the three generally available
  // skills, and COMMAND once the character is a Corporal or above.
  function termSkillOptions(S, career, group) {
    var out = career.skills.slice();
    // "They also get to choose which of the two columns to use for each career bonus"
    // (printed p32) -- so an officer draws on the Officer list AND their functional area.
    if (S.current && S.current.officerArea) {
      var area = findCareer(S, S.current.officerArea);
      if (area) for (var q = 0; q < area.career.skills.length; q++) {
        if (out.indexOf(area.career.skills[q]) < 0) out.push(area.career.skills[q]);
      }
    }
    var gen = S.DATA.skills.generally_available;
    for (var i = 0; i < gen.length; i++) if (out.indexOf(gen[i]) < 0) out.push(gen[i]);
    if (group.type === 'military' && isNCO(S) && out.indexOf('Command') < 0) out.push('Command');
    return out;
  }

  function beginTerm(S, careerKey, officerArea) {
    var f = findCareer(S, careerKey);
    S.current = {
      careerKey: careerKey, career: f.career, group: f.group,
      officerArea: officerArea || null,
      // captured before the term is counted, so the RANGED COMBAT rule fires on term one
      firstMilitary: f.group.type === 'military' && isFirstMilitaryTerm(S),
      termNo: S.terms.length + 1,
      startAge: S.age,
      increases: [],           // skill names raised this term, one entry per step
      promoted: false, promotionRoll: null, specialtyGained: null,
      years: 0, ageEffect: null, warRoll: null, log: []
    };
    if (S.rankIndex < 0 && f.group.type === 'military') {
      S.rankIndex = rankIndexOf(S, f.career.starting_rank);
      S.current.log.push({ v: '--', t: 'Enlisted as ' + f.career.starting_rank });
    }
    return S.current;
  }

  function rankIndexOf(S, name) {
    var l = S.DATA.core.ranks.ladder;
    for (var i = 0; i < l.length; i++) if (l[i].US === name) return i;
    return 0;
  }
  function rankName(S, nationality) {
    if (S.rankIndex < 0) return '';
    var row = S.DATA.core.ranks.ladder[S.rankIndex];
    var col = { 'United States': 'US', 'Soviet Union': 'Soviet', 'Poland': 'Polish', 'Sweden': 'Swedish' }[nationality || S.nationality] || 'US';
    var n = row[col];
    return (!n || n === '--') ? row.US : n;
  }

  // Step 6: two skills one step each, or one skill two steps.
  function increasesRemaining(S) { return 2 - (S.current ? S.current.increases.length : 0); }
  function canTakeIncrease(S, name) {
    if (!S.current || increasesRemaining(S) <= 0) return false;
    if (!canRaiseSkill(S, name)) return false;
    // "one skill two steps" is allowed, so a repeat is legal -- but never three.
    return true;
  }
  function takeIncrease(S, name) {
    if (!canTakeIncrease(S, name)) return false;
    raiseSkill(S, name);
    S.current.increases.push(name);
    return true;
  }
  function undoIncrease(S) {
    if (!S.current || !S.current.increases.length) return false;
    var name = S.current.increases.pop();
    lowerSkill(S, name);
    return true;
  }
  // The first term of military service must include RANGED COMBAT.
  function increasesValid(S) {
    if (!S.current || S.current.increases.length !== 2) return false;
    if (S.current.group.type === 'military' && S.current.firstMilitary &&
        S.current.increases.indexOf('Ranged Combat') < 0) return false;
    return true;
  }

  // Step 7: promotion.
  function promotionRoll(S, skillName) {
    var r = skillRoll(S, skillName);
    S.current.promotionRoll = r;
    S.current.promoted = r.ok;
    return r;
  }
  // An officer may roll their specialty on either column; everyone else has one table.
  function specialtyTables(S) {
    var t = S.current;
    var out = [{ label: t.career.name, table: t.career.specialties }];
    if (t.officerArea) {
      var area = findCareer(S, t.officerArea);
      if (area) out.push({ label: area.career.name, table: area.career.specialties });
    }
    return out;
  }

  function rollSpecialty(S, table) {
    var d = S.rng.d6();
    var got = table[d - 1];
    return { roll: d, specialty: got, duplicate: S.specialties.indexOf(got) >= 0 };
  }
  function gainSpecialty(S, name) {
    if (S.specialties.indexOf(name) >= 0) return false;
    S.specialties.push(name);
    return true;
  }
  function applyPromotion(S) {
    var g = S.current.group;
    if (g.type === 'military') {
      S.rankIndex = Math.min(S.DATA.core.ranks.ladder.length - 1, Math.max(0, S.rankIndex) + 1);
    }
    if (g.type === 'military' || g.type === 'intelligence') {
      if (rank(S.cuf) < rank('A')) S.cuf = stepUp(S.cuf);
    }
  }

  // Step 8: age D6 years, then a D8 against terms completed.
  function ageTerm(S) {
    var years = S.rng.d6();
    S.age += years;
    S.current.years = years;
    var roll = S.rng.d8();
    var termsDone = S.terms.length + 1;          // this term counts once it closes
    S.current.ageRoll = { roll: roll, terms: termsDone, effect: roll < termsDone };
    return S.current.ageRoll;
  }
  function applyAgeEffect(S, attr) {
    if (S.attrs[attr] === 'D') return false;     // cannot go below D
    S.attrs[attr] = stepDown(S.attrs[attr]);
    S.current.ageEffect = attr;
    return true;
  }
  function ageEffectPossible(S) {
    for (var i = 0; i < ATTRS.length; i++) if (S.attrs[ATTRS[i]] !== 'D') return true;
    return false;
  }

  // Step 9: war roll. Local militia skip it -- war breaks out by the end of term one.
  function warRoll(S) {
    if (S.localMilitia && S.terms.length + 1 >= 1) {
      S.current.warRoll = { roll: null, terms: S.terms.length + 1, war: true, militia: true };
      return S.current.warRoll;
    }
    var roll = S.rng.d8();
    var termsDone = S.terms.length + 1;
    S.current.warRoll = { roll: roll, terms: termsDone, war: roll < termsDone };
    return S.current.warRoll;
  }

  function closeTerm(S) {
    var t = S.current;
    S.terms.push(t);
    S.careerTermCount[t.careerKey] = (S.careerTermCount[t.careerKey] || 0) + 1;
    S.groupTermCount[t.group.key] = (S.groupTermCount[t.group.key] || 0) + 1;
    if (t.warRoll && t.warRoll.war) S.war = true;
    // Crime: if war did not break out, an odd D6 sends you to prison next term.
    // The UI shows this roll on the same screen as the war roll, so if it has already
    // been made it is reused rather than rolled a second time.
    if (t.group.key === 'crime' && !S.war) {
      t.prisonRoll = t.prisonPending || (function () {
        var d = S.rng.d6();
        return { roll: d, prison: d % 2 === 1 };
      })();
      S.prisonNext = t.prisonRoll.prison;
    } else {
      S.prisonNext = false;
    }
    S.current = null;
    return t;
  }

  // ---------- the At War term ----------
  function lastCareerTerm(S) { return S.terms.length ? S.terms[S.terms.length - 1] : null; }

  // The draft: a civilian final term (intelligence excepted) for a non-local character.
  function draftApplies(S) {
    var t = lastCareerTerm(S);
    if (!t) return false;
    if (S.localMilitia) return false;
    var ty = t.group.type;
    return ty !== 'military' && ty !== 'intelligence';
  }
  function atWarColumn(S) {
    if (draftApplies(S)) return 'Military';
    var t = lastCareerTerm(S);
    if (!t) return 'Other';
    return { military: 'Military', intelligence: 'Other', blue_collar: 'Blue Collar',
             white_collar: 'White Collar', education: 'White Collar', civilian: 'Other' }[t.group.type] || 'Other';
  }
  function atWarSpecialtyTable(S) {
    var col = atWarColumn(S);
    var rows = S.DATA.core.at_war.table.rows;
    var out = [];
    for (var i = 0; i < rows.length; i++) out.push(rows[i][col]);
    return out;
  }
  // The draft forces RANGED COMBAT unless the character already has D or better.
  function atWarForcedSkill(S) {
    if (!draftApplies(S)) return null;
    return rank(skillLevel(S, 'Ranged Combat')) >= rank('D') ? null : 'Ranged Combat';
  }
  function beginAtWar(S) {
    S.current = {
      careerKey: 'at_war', career: { name: 'At War', skills: [] },
      group: { key: 'at_war', name: 'At War', type: 'at_war' },
      termNo: S.terms.length + 1, startAge: S.age,
      increases: [], atWar: true, log: []
    };
    return S.current;
  }
  // At War raises any two DIFFERENT skills one step each.
  function canTakeAtWarIncrease(S, name) {
    if (!S.current || S.current.increases.length >= 2) return false;
    if (S.current.increases.indexOf(name) >= 0) return false;
    return canRaiseSkill(S, name);
  }
  function closeAtWar(S) {
    var t = S.current;
    S.atWar = t;
    S.terms.push(t);
    S.current = null;
    return t;
  }

  // ---------- snapshots, for free navigation ----------
  // Re-opening an earlier step has to UNDO everything that followed it, and this is a
  // dice-driven life path -- rank, skills, CUF and the war clock all accumulate, so
  // there is no way to compute backwards. Instead the state is photographed before each
  // step and restoring is exact. The RNG's position is saved too, so replaying from a
  // restore point does not reuse the dice the discarded terms already spent.
  // `snaps` is detached along with DATA and rng: a snapshot must never contain the
  // other snapshots, or each one doubles the size of the next.
  function snapshot(S) {
    var data = S.DATA, rng = S.rng, snaps = S.snaps;
    S.DATA = null; S.rng = null; S.snaps = null;
    var copy;
    try { copy = JSON.parse(JSON.stringify(S)); }
    finally { S.DATA = data; S.rng = rng; S.snaps = snaps; }
    copy.__rng = rng.s;
    return copy;
  }
  // Mutates S in place so every existing reference to it stays valid.
  function restore(S, snap) {
    var data = S.DATA, rng = S.rng, snaps = S.snaps;
    for (var k in S) if (Object.prototype.hasOwnProperty.call(S, k)) delete S[k];
    var fresh = JSON.parse(JSON.stringify(snap));
    for (var j in fresh) if (Object.prototype.hasOwnProperty.call(fresh, j)) S[j] = fresh[j];
    delete S.__rng;
    S.DATA = data;
    S.rng = rng;
    S.snaps = snaps;
    rng.s = (snap.__rng >>> 0) || 1;
    return S;
  }

  // ---------- derived ----------
  function hitCapacity(S) { return Math.ceil((dieSize(S.attrs.STR) + dieSize(S.attrs.AGL)) / 4); }
  function stressCapacity(S) { return Math.ceil((dieSize(S.attrs.INT) + dieSize(S.attrs.EMP)) / 4); }
  function unitMorale(S) { return skillLevel(S, 'Command'); }

  // Gear comes from the final career term BEFORE the At War term -- or from Combat Arms
  // if the character was drafted.
  function gearSource(S) {
    var t = lastPreWarTerm(S);
    if (!t) return null;
    if (draftApplies(S)) {
      var ca = findCareer(S, 'combat_arms');
      return { name: 'Combat Arms (drafted)', gear: ca.career.gear };
    }
    return { name: t.career.name, gear: t.career.gear || [] };
  }
  function lastPreWarTerm(S) {
    for (var i = S.terms.length - 1; i >= 0; i--) if (!S.terms[i].atWar) return S.terms[i];
    return null;
  }
  function rollFinalSupplies(S) {
    S.rations = S.rng.d6();
    S.water = S.rng.d6();
    S.ammo = S.rng.d6();
    S.rads = S.rng.d6();
    return { rations: S.rations, water: S.water, ammo: S.ammo, rads: S.rads };
  }

  var API = {
    RNG: RNG, ATTRS: ATTRS, RANKED: RANKED,
    rank: rank, levelAt: levelAt, dieSize: dieSize, atLeast: atLeast,
    stepUp: stepUp, stepDown: stepDown,
    start: start, newState: newState,
    canRaiseAttr: canRaiseAttr, raiseAttr: raiseAttr, lowerAttr: lowerAttr,
    tradeDown: tradeDown, undoTradeDown: undoTradeDown,
    skillLevel: skillLevel, raiseSkill: raiseSkill, lowerSkill: lowerSkill,
    canRaiseSkill: canRaiseSkill, skillAttr: skillAttr, skillRoll: skillRoll,
    allGroups: allGroups, findCareer: findCareer, meets: meets, careerOptions: careerOptions,
    officerAreas: officerAreas, specialtyTables: specialtyTables,
    isFirstMilitaryTerm: isFirstMilitaryTerm, isNCO: isNCO, termSkillOptions: termSkillOptions,
    beginTerm: beginTerm, rankName: rankName, rankIndexOf: rankIndexOf,
    increasesRemaining: increasesRemaining, canTakeIncrease: canTakeIncrease,
    takeIncrease: takeIncrease, undoIncrease: undoIncrease, increasesValid: increasesValid,
    promotionRoll: promotionRoll, rollSpecialty: rollSpecialty, gainSpecialty: gainSpecialty,
    applyPromotion: applyPromotion,
    ageTerm: ageTerm, applyAgeEffect: applyAgeEffect, ageEffectPossible: ageEffectPossible,
    warRoll: warRoll, closeTerm: closeTerm,
    lastCareerTerm: lastCareerTerm, lastPreWarTerm: lastPreWarTerm,
    draftApplies: draftApplies, atWarColumn: atWarColumn, atWarSpecialtyTable: atWarSpecialtyTable,
    atWarForcedSkill: atWarForcedSkill, beginAtWar: beginAtWar,
    canTakeAtWarIncrease: canTakeAtWarIncrease, closeAtWar: closeAtWar,
    snapshot: snapshot, restore: restore,
    hitCapacity: hitCapacity, stressCapacity: stressCapacity, unitMorale: unitMorale,
    gearSource: gearSource, rollFinalSupplies: rollFinalSupplies
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.T2KEngine = API;
})(typeof window !== 'undefined' ? window : this);
