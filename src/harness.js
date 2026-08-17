/* node src/harness.js [runs]
   Fuzzes complete life paths through the engine, making random LEGAL choices, and
   asserts the book's invariants at every term boundary.

   The biggest risk in a loop model is non-termination, so every run must reach the
   At War term. War is forced by term 9 (a D8 can never roll 9 or more), which is the
   real ceiling this asserts.
*/
var path = require('path');
var fs = require('fs');
var E = require('./engine.js');

var DIR = path.join(__dirname, 'data');
function j(p) { return JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')); }
var DATA = {
  core: j('core-rules.json'),
  skills: j('skills-and-specialties.json'),
  military: j(path.join('careers', 'military.json')),
  civilian: j(path.join('careers', 'civilian.json'))
};

var RUNS = parseInt(process.argv[2], 10) || 2000;
var checks = 0, failures = [];
var COV = { careers: {}, promotions: 0, dupSpecialty: 0, ageEffects: 0, prison: 0,
            draft: 0, militia: 0, columns: {}, termCounts: {}, officerAreas: {} };
function ok(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}

var ALL_SKILLS = DATA.skills.skills.map(function (s) { return s.name; });
var VALID_SKILL_LEVELS = ['D', 'C', 'B', 'A'];
var VALID_ATTR_LEVELS = ['D', 'C', 'B', 'A'];

function invariants(S, where, seed) {
  var tag = 'seed ' + seed + ' @ ' + where + ': ';
  E.ATTRS.forEach(function (a) {
    ok(VALID_ATTR_LEVELS.indexOf(S.attrs[a]) >= 0, tag + a + ' is ' + S.attrs[a] + ', outside A-D');
  });
  Object.keys(S.skills).forEach(function (k) {
    ok(ALL_SKILLS.indexOf(k) >= 0, tag + 'unknown skill name "' + k + '"');
    ok(VALID_SKILL_LEVELS.indexOf(S.skills[k]) >= 0, tag + k + ' is ' + S.skills[k] + ', outside A-D');
    ok(k.indexOf(' or ') < 0, tag + 'unresolved "or" stored as a skill: ' + k);
  });
  ok(VALID_ATTR_LEVELS.indexOf(S.cuf) >= 0, tag + 'CUF is ' + S.cuf);
  ok(S.age >= 18 && S.age <= 18 + 10 * 6, tag + 'age out of range: ' + S.age);
  ok(S.rankIndex >= -1 && S.rankIndex < DATA.core.ranks.ladder.length, tag + 'rankIndex ' + S.rankIndex);
  var seen = {};
  S.specialties.forEach(function (sp) {
    ok(!seen[sp], tag + 'duplicate specialty ' + sp);
    seen[sp] = 1;
  });
  ok(S.attrIncreasesLeft === 0, tag + 'unspent attribute increases: ' + S.attrIncreasesLeft);
}

function pick(rng, arr) { return arr[Math.floor(rng.next() * arr.length)]; }

for (var run = 0; run < RUNS; run++) {
  var seed = (run * 2654435761 + 12345) >>> 0 || 1;
  var S = E.start(DATA, seed);
  S.nationality = pick(S.rng, DATA.core.nationality.options);
  S.localMilitia = S.rng.next() < 0.1;

  // ---- step 3: attributes ----
  var wanted = S.attrIncreasesLeft;
  ok(wanted >= 2 && wanted <= 6, 'seed ' + seed + ': 2D3 gave ' + wanted);
  if (S.rng.next() < 0.3) {
    var t = pick(S.rng, E.ATTRS);
    E.tradeDown(S, t);
  }
  var guard = 0;
  while (S.attrIncreasesLeft > 0 && guard++ < 50) {
    var a = pick(S.rng, E.ATTRS);
    if (E.canRaiseAttr(S, a)) E.raiseAttr(S, a);
    else {
      // every attribute at A -- spend the rest anywhere legal, else bail out
      var any = E.ATTRS.filter(function (x) { return E.canRaiseAttr(S, x); });
      if (!any.length) { S.attrIncreasesLeft = 0; break; }
    }
  }
  ok(S.attrIncreasesLeft === 0, 'seed ' + seed + ': attribute increases not spent');

  // ---- step 4: childhood ----
  var ch = DATA.core.childhood.table[S.rng.d6() - 1];
  S.childhood = ch.name;
  E.raiseSkill(S, pick(S.rng, ch.skills));
  var cs = ch.specialties[S.rng.d6() - 1];
  E.gainSpecialty(S, cs);
  invariants(S, 'childhood', seed);

  // ---- steps 5-9: the term loop ----
  var termGuard = 0;
  while (!S.war && termGuard++ < 20) {
    var opts = E.careerOptions(S).filter(function (o) { return o.ok; });
    ok(opts.length > 0, 'seed ' + seed + ': no legal career at term ' + (S.terms.length + 1));
    if (!opts.length) break;

    var choice;
    if (S.prisonNext) {
      COV.prison++;
      choice = E.careerOptions(S).filter(function (o) { return o.career.key === 'prisoner'; })[0];
    } else {
      choice = pick(S.rng, opts);
    }
    var area = null;
    if (choice.career.key === 'officer') {
      var areas = E.officerAreas(S);
      ok(areas.length > 0, 'seed ' + seed + ': officer offered with no functional area');
      area = pick(S.rng, areas).key;
      COV.officerAreas[area] = (COV.officerAreas[area] || 0) + 1;
    }
    var cur = E.beginTerm(S, choice.career.key, area);
    COV.careers[choice.career.key] = (COV.careers[choice.career.key] || 0) + 1;

    // step 6: two increases
    var pool = E.termSkillOptions(S, cur.career, cur.group);
    // beginTerm now spends the compulsory Ranged Combat step itself
    if (cur.firstMilitary) {
      ok(cur.increases.indexOf('Ranged Combat') >= 0,
         'seed ' + seed + ': first military term did not auto-take Ranged Combat');
      ok(cur.increases.length === 1,
         'seed ' + seed + ': auto-take spent ' + cur.increases.length + ' steps, expected 1');
    }
    var ig = 0;
    while (E.increasesRemaining(S) > 0 && ig++ < 40) {
      var sk = pick(S.rng, pool);
      if (E.canTakeIncrease(S, sk)) E.takeIncrease(S, sk);
      else {
        var free = pool.filter(function (p) { return E.canTakeIncrease(S, p); });
        if (!free.length) {                  // everything in the pool is already at A
          var anySkill = ALL_SKILLS.filter(function (p) { return E.canTakeIncrease(S, p); });
          if (!anySkill.length) break;
          E.takeIncrease(S, pick(S.rng, anySkill));
        }
      }
    }
    ok(cur.increases.length === 2 || ig >= 40,
       'seed ' + seed + ': term ' + cur.termNo + ' took ' + cur.increases.length + ' increases');
    if (cur.firstMilitary) {
      ok(cur.increases.indexOf('Ranged Combat') >= 0,
         'seed ' + seed + ': first military term without Ranged Combat');
    }

    // step 7: promotion
    if (cur.increases.length) {
      var pr = E.promotionRoll(S, pick(S.rng, cur.increases));
      ok(pr.dice.length >= 1 && pr.dice.length <= 2, 'seed ' + seed + ': promotion rolled ' + pr.dice.length + ' dice');
      pr.rolls.forEach(function (r) {
        ok(r.roll >= 1 && r.roll <= r.die, 'seed ' + seed + ': d' + r.die + ' rolled ' + r.roll);
      });
      if (pr.ok) {
        COV.promotions++;
        var before = S.rankIndex, cufBefore = S.cuf;
        var tables = E.specialtyTables(S);
        ok(tables.length === (cur.officerArea ? 2 : 1),
           'seed ' + seed + ': ' + tables.length + ' specialty tables offered');
        var sp = E.rollSpecialty(S, pick(S.rng, tables).table);
        if (sp.duplicate) {
          COV.dupSpecialty++;
          var free2 = [];
          Object.keys(DATA.skills.specialties).forEach(function (g) {
            DATA.skills.specialties[g].forEach(function (x) {
              if (S.specialties.indexOf(x.name) < 0) free2.push(x.name);
            });
          });
          if (free2.length) E.gainSpecialty(S, pick(S.rng, free2));
        } else {
          E.gainSpecialty(S, sp.specialty);
        }
        E.applyPromotion(S);
        if (cur.group.type === 'military') {
          ok(S.rankIndex > before || before === DATA.core.ranks.ladder.length - 1,
             'seed ' + seed + ': military promotion did not raise rank');
        } else {
          ok(S.rankIndex === before, 'seed ' + seed + ': civilian career changed military rank');
        }
        if (cur.group.type === 'military' || cur.group.type === 'intelligence') {
          ok(E.rank(S.cuf) >= E.rank(cufBefore), 'seed ' + seed + ': CUF went down on promotion');
        } else {
          ok(S.cuf === cufBefore, 'seed ' + seed + ': ' + cur.group.type + ' promotion changed CUF');
        }
      }
    }

    // step 8: ageing
    var ageBefore = S.age;
    var ar = E.ageTerm(S);
    ok(S.age - ageBefore >= 1 && S.age - ageBefore <= 6, 'seed ' + seed + ': term length ' + (S.age - ageBefore));
    ok(!(ar.effect && cur.termNo === 1), 'seed ' + seed + ': age effect after the first term');
    if (ar.effect) COV.ageEffects++;
    if (ar.effect && E.ageEffectPossible(S)) {
      var can = E.ATTRS.filter(function (x) { return S.attrs[x] !== 'D'; });
      E.applyAgeEffect(S, pick(S.rng, can));
    }

    // step 9: war
    var wr = E.warRoll(S);
    if (wr.roll !== null) ok(wr.roll >= 1 && wr.roll <= 8, 'seed ' + seed + ': war D8 = ' + wr.roll);
    E.closeTerm(S);
    invariants(S, 'term ' + cur.termNo, seed);
  }

  ok(S.war, 'seed ' + seed + ': war never broke out after ' + S.terms.length + ' terms');
  ok(S.terms.length <= 9, 'seed ' + seed + ': ' + S.terms.length + ' career terms, over the D8 ceiling');

  // ---- step 10: At War ----
  var aw = E.beginAtWar(S);
  var col = E.atWarColumn(S);
  ok(['Military', 'Blue Collar', 'White Collar', 'Other'].indexOf(col) >= 0, 'seed ' + seed + ': bad At War column ' + col);
  if (E.draftApplies(S)) COV.draft++;
  if (S.localMilitia) COV.militia++;
  COV.columns[col] = (COV.columns[col] || 0) + 1;
  var forced = E.atWarForcedSkill(S);
  if (forced) {
    ok(E.canTakeAtWarIncrease(S, forced) || E.skillLevel(S, forced) === 'A',
       'seed ' + seed + ': forced draft skill not takeable');
    E.canTakeAtWarIncrease(S, forced) && (E.raiseSkill(S, forced), aw.increases.push(forced));
  }
  var ag = 0;
  while (aw.increases.length < 2 && ag++ < 40) {
    var s2 = pick(S.rng, ALL_SKILLS);
    if (E.canTakeAtWarIncrease(S, s2)) { E.raiseSkill(S, s2); aw.increases.push(s2); }
    else {
      var free3 = ALL_SKILLS.filter(function (p) { return E.canTakeAtWarIncrease(S, p); });
      if (!free3.length) break;
    }
  }
  ok(aw.increases.length <= 2, 'seed ' + seed + ': At War took ' + aw.increases.length + ' increases');
  ok(aw.increases.length === new Set(aw.increases).size, 'seed ' + seed + ': At War raised the same skill twice');

  var awTable = E.atWarSpecialtyTable(S);
  ok(awTable.length === 6, 'seed ' + seed + ': At War table has ' + awTable.length + ' rows');
  var awSp = E.rollSpecialty(S, awTable);
  if (!awSp.duplicate) E.gainSpecialty(S, awSp.specialty);
  E.closeAtWar(S);

  // ---- steps 11-21 ----
  var hit = E.hitCapacity(S), stress = E.stressCapacity(S);
  ok(hit >= 3 && hit <= 6, 'seed ' + seed + ': hit capacity ' + hit);
  ok(stress >= 3 && stress <= 6, 'seed ' + seed + ': stress capacity ' + stress);
  var gs = E.gearSource(S);
  ok(gs && gs.gear && gs.gear.length > 0, 'seed ' + seed + ': no starting gear source');
  if (E.draftApplies(S)) {
    ok(/drafted/.test(gs.name), 'seed ' + seed + ': draft did not switch gear to Combat Arms');
  }
  var sup = E.rollFinalSupplies(S);
  ['rations', 'water', 'ammo', 'rads'].forEach(function (k) {
    ok(sup[k] >= 1 && sup[k] <= 6, 'seed ' + seed + ': ' + k + ' = ' + sup[k]);
  });
  ok(E.rank(E.unitMorale(S)) >= 0, 'seed ' + seed + ': bad unit morale');

  var tc = S.terms.length;
  COV.termCounts[tc] = (COV.termCounts[tc] || 0) + 1;
  invariants(S, 'final', seed);
}

// Coverage -- a harness that never reaches a branch proves nothing about it.
console.log('fuzzed ' + RUNS + ' life paths');
console.log('  careers entered   : ' + Object.keys(COV.careers).length + '/24  ' + JSON.stringify(COV.careers));
console.log('  promotions        : ' + COV.promotions + '  (specialty re-rolls on a duplicate: ' + COV.dupSpecialty + ')');
console.log('  age effects       : ' + COV.ageEffects);
console.log('  prison sentences  : ' + COV.prison);
console.log('  drafted at war    : ' + COV.draft + '   militia auto-war: ' + COV.militia);
console.log('  officer areas     : ' + JSON.stringify(COV.officerAreas));
console.log('  At War columns    : ' + JSON.stringify(COV.columns));
console.log('  terms per life    : ' + JSON.stringify(COV.termCounts));
console.log(checks + ' checks, ' + failures.length + ' failed');
if (failures.length) {
  var shown = {};
  failures.slice(0, 400).forEach(function (f) {
    var key = f.replace(/seed \d+/, 'seed *');
    if (shown[key]) return;
    shown[key] = 1;
    console.log('  FAIL ' + f);
  });
  process.exit(1);
}
console.log('ALL PASS');
