/* Twilight: 2000 generator -- UI driver.
   The engine owns the rules; this file owns what the screen asks next.
   Rendering dispatches on S.phase + S.sub, because much of the term is REPORTING a
   roll rather than asking a question. */
(function () {
  'use strict';
  var E = window.T2KEngine;
  var main, track;

  var PHASES = [
    ['who', 'Who You Are'], ['attrs', 'Attributes'], ['childhood', 'Childhood'],
    ['terms', 'Life Path'], ['atwar', 'At War'], ['finish', 'Final Details'], ['done', 'Dossier']
  ];

  var S = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function seed() { return (Math.floor(Math.random() * 4294967295) >>> 0) || 1; }

  function fresh() {
    S = E.start(DATA, seed());
    S.phase = 'who';
    S.sub = null;
    S.nationality = 'United States';
    S.termLog = [];
    S.pendingCareer = null;
    S.pendingArea = null;
    S.gearPicks = {};
    window.__S = S;
  }

  // ---------------- render ----------------
  function renderTrack() {
    var idx = 0;
    for (var i = 0; i < PHASES.length; i++) if (PHASES[i][0] === S.phase) idx = i;
    track.innerHTML = PHASES.map(function (p, i) {
      var cls = 'track-item' + (i === idx ? ' active' : (i < idx ? ' done' : ''));
      return '<div class="' + cls + '">' + esc(p[1]) + '</div>';
    }).join('');
  }

  var lastView = null;
  function render() {
    renderTrack();
    var h = '';
    if (S.phase === 'who') h = viewWho();
    else if (S.phase === 'attrs') h = viewAttrs();
    else if (S.phase === 'childhood') h = viewChildhood();
    else if (S.phase === 'terms') h = viewTerms();
    else if (S.phase === 'atwar') h = viewAtWar();
    else if (S.phase === 'finish') h = viewFinish();
    else h = viewDossier();
    main.innerHTML = h + (S.phase === 'done' ? printSheet() : '');
    var view = S.phase + '/' + (S.sub || '');
    if (view !== lastView) { lastView = view; window.scrollTo(0, 0); }
  }

  // ---- shared panels ----
  function attrsPanel(editable) {
    return '<div class="panel"><div class="panel-t">Attributes</div><div class="attrs">' +
      E.ATTRS.map(function (a) {
        var lv = S.attrs[a];
        var btns = editable ? '<div class="at-btns">' +
          '<button class="at-btn" onclick="A.attrDown(\'' + a + '\')"' +
            (canLower(a) ? '' : ' disabled') + '>&minus;</button>' +
          '<button class="at-btn" onclick="A.attrUp(\'' + a + '\')"' +
            (E.canRaiseAttr(S, a) ? '' : ' disabled') + '>+</button></div>' : '';
        return '<div class="at"><div class="at-k">' + a + '</div><div class="at-v">' + lv +
          '</div><div class="at-d">D' + E.dieSize(lv) + '</div>' + btns + '</div>';
      }).join('') + '</div>' +
      (editable ? '<div class="at-note">' + S.attrIncreasesLeft + ' increase' +
        (S.attrIncreasesLeft === 1 ? '' : 's') + ' left to spend</div>' : '') +
      '</div>';
  }
  function canLower(a) {
    var floor = (S.tradedDown === a) ? 'D' : 'C';
    return E.rank(S.attrs[a]) > E.rank(floor);
  }

  function skillsPanel() {
    var keys = Object.keys(S.skills).sort();
    if (!keys.length) return '';
    return '<div class="panel"><div class="panel-t">Skills</div><div class="skills-list">' +
      keys.map(function (k) {
        return '<div class="sk"><span>' + esc(k) + '</span><span class="sk-v">' + S.skills[k] +
          ' &middot; D' + E.dieSize(S.skills[k]) + '</span></div>';
      }).join('') + '</div></div>';
  }
  function specialtiesPanel() {
    if (!S.specialties.length) return '';
    return '<div class="panel"><div class="panel-t">Specialties</div><div class="spec-list">' +
      S.specialties.map(function (sp) {
        return '<div class="sk"><span>' + esc(sp) + '</span></div>';
      }).join('') + '</div></div>';
  }
  function statusLine() {
    var r = E.rankName(S);
    return 'Age ' + S.age + ' &middot; CUF ' + S.cuf + (r ? ' &middot; ' + esc(r) : '') +
      ' &middot; ' + S.terms.length + ' term' + (S.terms.length === 1 ? '' : 's');
  }
  function rollLine(v, t, cls) {
    return '<div class="roll ' + (cls || '') + '"><span class="roll-v">' + v +
      '</span><span class="roll-t">' + t + '</span></div>';
  }
  function diceHTML(rolls) {
    return '<span class="dice">' + rolls.map(function (r) {
      return '<span class="die' + (r.roll >= 6 ? ' hit' : '') + '">' + r.roll + '</span>';
    }).join('') + '</span>';
  }

  // ---- 1. who you are ----
  function viewWho() {
    var nats = DATA.core.nationality.options;
    return '<div class="step-h">Who You Are</div>' +
      '<div class="step-p">You are 18 years old and the world has not ended yet. Nationality does not change how you are built &mdash; only your gear, your language and what your rank is called.</div>' +
      '<div class="panel"><div class="panel-t">Name and nation</div><div class="grid2">' +
      '<div><label class="lbl">Name</label><input class="txt name-inp" value="' + esc(S.name) +
        '" oninput="A.set(\'name\',this.value)" placeholder="Your character">' +
      '<button class="btn ghost btn-rand" type="button" onclick="A.randName()">&#9860; Random name</button></div>' +
      '<div><label class="lbl">Nickname</label><input class="txt nick-inp" value="' + esc(S.nickname) +
        '" oninput="A.set(\'nickname\',this.value)" placeholder="Optional"></div>' +
      '</div>' +
      '<div style="margin-top:14px"><label class="lbl">Nationality</label><select class="sel" onchange="A.set(\'nationality\',this.value);A.rerender()">' +
      nats.map(function (n) {
        return '<option value="' + esc(n) + '"' + (S.nationality === n ? ' selected' : '') + '>' + esc(n) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="opt' + (S.localMilitia ? ' on' : '') + '" style="margin-top:12px" onclick="A.toggleMilitia()">' +
      '<div class="opt-box">' + (S.localMilitia ? '&#10003;' : '') + '</div><div>' +
      '<div class="opt-n">Local militia</div><div class="opt-d">Fighting on your own home ground. War automatically breaks out by the end of your first term, and you also get the At War career.</div></div></div>' +
      '</div>' +
      '<div class="note">' + esc(DATA.core.nationality.languages) + '</div>' +
      '<div class="btn-row"><button class="btn ghost" onclick="A.restart()">Start over</button>' +
      '<button class="btn" onclick="A.go(\'attrs\')">Continue &rarr;</button></div>';
  }

  // ---- 2. attributes ----
  function viewAttrs() {
    var done = S.attrIncreasesLeft === 0;
    return '<div class="step-h">Attributes</div>' +
      '<div class="step-p">Everyone starts at C in all four. You rolled 2D3 for how many increases you get &mdash; spend them where you like. A is the top of human capacity; the die you roll goes up with the grade.</div>' +
      attrsPanel(true) +
      '<div class="panel"><div class="panel-t">Trade one down</div>' +
      '<div class="opt' + (S.tradedDown ? ' on' : '') + '" onclick="A.toggleTrade()">' +
      '<div class="opt-box">' + (S.tradedDown ? '&#10003;' : '') + '</div><div>' +
      '<div class="opt-n">Drop one attribute from C to D for one extra increase' +
        (S.tradedDown ? ' &mdash; traded ' + esc(S.tradedDown) : '') + '</div>' +
      '<div class="opt-d">Optional. Tick this, then use the minus button on the attribute you want to weaken.</div></div></div></div>' +
      '<div class="note">Careers have attribute requirements, so it is worth knowing where you are heading before you spend these. Special Operations wants STR and AGL at B, an Officer needs INT B and no D at all.</div>' +
      '<div class="btn-row"><button class="btn ghost" onclick="A.go(\'who\')">&larr; Back</button>' +
      '<button class="btn"' + (done ? '' : ' disabled') + ' onclick="A.go(\'childhood\')">Continue &rarr;</button></div>';
  }

  // ---- 3. childhood ----
  function viewChildhood() {
    var h = '<div class="step-h">Childhood</div>' +
      '<div class="step-p">Roll a D6 for what your childhood was like, or choose it. Then take one of its skills at level D and roll a D6 for a specialty.</div>';
    if (!S.childhood) {
      h += '<div class="panel"><div class="panel-t">Where you grew up</div>' +
        DATA.core.childhood.table.map(function (c) {
          return '<div class="opt" onclick="A.childhood(' + c.d6 + ')"><div class="opt-box"></div><div>' +
            '<div class="opt-n">' + c.d6 + '. ' + esc(c.name) + '</div>' +
            '<div class="opt-d">' + c.skills.map(esc).join(', ') + '</div></div></div>';
        }).join('') + '</div>' +
        '<div class="btn-row"><button class="btn ghost" onclick="A.go(\'attrs\')">&larr; Back</button>' +
        '<button class="btn" onclick="A.rollChildhood()">&#9860; Roll a D6</button></div>';
      return h;
    }
    var ch = S.childhoodRow;
    h += '<div class="panel"><div class="panel-t">' + esc(ch.name) + '</div>' +
      (S.childhoodRoll ? rollLine(S.childhoodRoll, 'D6 for childhood: ' + esc(ch.name)) : '') +
      '<div class="panel-t" style="margin-top:14px">Take one skill at level D</div>' +
      ch.skills.map(function (sk) {
        var on = S.childhoodSkill === sk;
        return '<div class="opt' + (on ? ' on' : '') + '" onclick="A.childhoodSkill(\'' + esc(sk) + '\')">' +
          '<div class="opt-box">' + (on ? '&#10003;' : '') + '</div><div class="opt-n">' + esc(sk) + '</div></div>';
      }).join('') + '</div>';
    if (S.childhoodSkill) {
      h += '<div class="panel"><div class="panel-t">Specialty</div>';
      if (S.childhoodSpecialty) {
        h += rollLine(S.childhoodSpecRoll, 'D6 for specialty: <b>' + esc(S.childhoodSpecialty) + '</b>', 'good');
      } else {
        h += '<div class="note">Roll a D6 on your childhood column for one specialty.</div>' +
          '<div class="btn-row tight"><button class="btn" onclick="A.rollChildSpec()">&#9860; Roll a D6</button></div>';
      }
      h += '</div>';
    }
    h += skillsPanel() + specialtiesPanel();
    h += '<div class="btn-row"><button class="btn ghost" onclick="A.resetChildhood()">Choose again</button>' +
      '<button class="btn"' + (S.childhoodSpecialty ? '' : ' disabled') +
      ' onclick="A.go(\'terms\')">Begin your life path &rarr;</button></div>';
    return h;
  }

  // ---- 4. the term loop ----
  function historyHTML() {
    if (!S.terms.length) return '';
    return '<div class="panel"><div class="panel-t">Life path so far</div><div class="hist">' +
      S.terms.map(function (t, i) {
        var bits = [];
        if (t.promoted) bits.push('promoted');
        if (t.specialtyGained) bits.push(t.specialtyGained);
        if (t.ageEffect) bits.push(t.ageEffect + ' down');
        if (t.atWarSpecialty) bits.push(t.atWarSpecialty);
        // The At War term has no length of its own -- it is not aged for.
        return '<div class="hist-row"><div class="hist-t">Term ' + (i + 1) + '</div>' +
          '<div class="hist-c"><b>' + esc(t.career.name) + '</b>' +
          (t.officerArea ? ' <span class="hist-r">(' + esc(E.findCareer(S, t.officerArea).career.name) + ')</span>' : '') +
          (bits.length ? ' <span class="hist-r">&middot; ' + esc(bits.join(', ')) + '</span>' : '') + '</div>' +
          '<div class="hist-r">' + (t.years ? t.years + 'yr' : '&mdash;') + '</div></div>';
      }).join('') + '</div></div>';
  }

  function viewTerms() {
    var h = '<div class="step-h">Term ' + (S.terms.length + 1) + '</div>' +
      '<div class="step-p">' + statusLine() + '. Each term runs D6 years. Pick a career you qualify for, take your training, then find out whether you were promoted, whether the years told on you, and whether the war has started.</div>';
    h += historyHTML();

    if (!S.sub || S.sub === 'pick') return h + viewPickCareer() + skillsPanel();
    if (S.sub === 'train') return h + viewTrain() + skillsPanel();
    if (S.sub === 'promote') return h + viewPromote() + skillsPanel();
    if (S.sub === 'age') return h + viewAge() + skillsPanel();
    return h;
  }

  function viewPickCareer() {
    if (S.prisonNext) {
      return '<div class="panel"><div class="panel-t">Caught</div>' +
        '<div class="note warn">Your last term was a life of crime and the war did not start. You rolled odd on the D6 &mdash; this term is spent in prison.</div>' +
        '<div class="opt" onclick="A.pickCareer(\'prisoner\')"><div class="opt-box"></div>' +
        '<div class="opt-n">Serve your sentence</div></div></div>';
    }
    if (S.askArea) {
      return '<div class="panel"><div class="panel-t">Officer &mdash; choose your functional area</div>' +
        '<div class="note">An officer must qualify for both the Officer path and the area they serve in. You may draw skills from either column, and roll your specialty on either.</div>' +
        S.askArea.map(function (c) {
          return '<div class="opt" onclick="A.pickArea(\'' + c.key + '\')"><div class="opt-box"></div><div>' +
            '<div class="opt-n">' + esc(c.name) + '</div>' +
            '<div class="opt-d">' + esc(c.skills.join(', ')) + '</div></div></div>';
        }).join('') +
        '<div class="btn-row tight"><button class="btn ghost" onclick="A.cancelArea()">Back</button></div></div>';
    }
    var opts = E.careerOptions(S);
    var groups = {};
    opts.forEach(function (o) {
      (groups[o.group.key] = groups[o.group.key] || { group: o.group, list: [] }).list.push(o);
    });
    var h = '';
    Object.keys(groups).forEach(function (gk) {
      var g = groups[gk];
      h += '<div class="panel"><div class="panel-t">' + esc(g.group.name) + '</div>' +
        (g.group.blurb ? '<div class="note">' + esc(g.group.blurb) + '</div>' : '') +
        g.list.map(function (o) {
          var c = o.career;
          return '<div class="opt' + (o.ok ? '' : ' disabled') + (S.pendingCareer === c.key ? ' on' : '') +
            '" onclick="' + (o.ok ? 'A.pickCareer(\'' + c.key + '\')' : '') + '">' +
            '<div class="opt-box">' + (S.pendingCareer === c.key ? '&#10003;' : '') + '</div><div>' +
            '<div class="opt-n">' + esc(c.name) +
            (c.starting_rank ? ' <span class="hist-r">&mdash; enters as ' + esc(c.starting_rank) + '</span>' : '') + '</div>' +
            '<div class="opt-d">' + esc(c.skills.join(', ')) + '</div>' +
            (o.ok ? '' : '<div class="opt-x">needs ' + esc(o.fails.join(', ')) + '</div>') +
            '</div></div>';
        }).join('') + '</div>';
    });
    return h;
  }

  function viewTrain() {
    var cur = S.current;
    var pool = E.termSkillOptions(S, cur.career, cur.group);
    var left = E.increasesRemaining(S);
    var h = '<div class="panel"><div class="term-hd"><div class="term-n">' + esc(cur.career.name) +
      (cur.officerArea ? ' &middot; ' + esc(E.findCareer(S, cur.officerArea).career.name) : '') +
      '</div><div class="term-age">term ' + cur.termNo + '</div></div>' +
      cur.log.map(function (l) { return rollLine(l.v, esc(l.t)); }).join('') +
      '<div class="panel-t">Training &mdash; ' + (2 - left) + ' / 2 steps taken</div>' +
      '<div class="note">Raise two skills one step each, or one skill two steps. A skill you have never had starts at D.' +
      (cur.firstMilitary ? ' <b>This is your first term of military service, so one step must be Ranged Combat.</b>' : '') +
      (E.isNCO(S) && cur.group.type === 'military' ? ' As a Corporal or above you may always take Command.' : '') +
      '</div>' +
      '<div class="skills-list">' + pool.map(function (sk) {
        var taken = cur.increases.filter(function (x) { return x === sk; }).length;
        var can = E.canTakeIncrease(S, sk);
        return '<div class="opt' + (taken ? ' on' : '') + (can || taken ? '' : ' disabled') +
          '" onclick="' + (can ? 'A.increase(\'' + esc(sk) + '\')' : '') + '">' +
          '<div class="opt-box">' + (taken ? (taken > 1 ? taken : '&#10003;') : '') + '</div>' +
          '<div class="opt-n">' + esc(sk) + ' <span class="hist-r">' + E.skillLevel(S, sk) +
          (taken ? ' &rarr; ' + E.skillLevel(S, sk) : '') + '</span></div></div>';
      }).join('') + '</div></div>';
    var ready = E.increasesValid(S);
    h += '<div class="btn-row"><button class="btn ghost"' + (cur.increases.length ? '' : ' disabled') +
      ' onclick="A.undoIncrease()">Undo</button>' +
      '<button class="btn"' + (ready ? '' : ' disabled') + ' onclick="A.toPromotion()">Roll for promotion &rarr;</button></div>';
    if (!ready && cur.increases.length === 2 && cur.firstMilitary) {
      h += '<div class="note warn">Your first military term must include Ranged Combat.</div>';
    }
    return h;
  }

  function viewPromote() {
    var cur = S.current;
    var h = '<div class="panel"><div class="term-hd"><div class="term-n">' + esc(cur.career.name) +
      '</div><div class="term-age">term ' + cur.termNo + '</div></div>';
    if (!cur.promotionRoll) {
      h += '<div class="note">Make one unmodified skill roll with a skill you raised this term. You roll the skill die and its attribute die; a 6 or better on either is a success. You cannot push this roll.</div>' +
        cur.increases.filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (sk) {
          var at = E.skillAttr(S, sk);
          return '<div class="opt" onclick="A.promote(\'' + esc(sk) + '\')"><div class="opt-box"></div><div>' +
            '<div class="opt-n">' + esc(sk) + '</div>' +
            '<div class="opt-d">D' + E.dieSize(E.skillLevel(S, sk)) + ' + ' + at + ' D' + E.dieSize(S.attrs[at]) + '</div></div></div>';
        }).join('');
      return h + '</div>';
    }
    var pr = cur.promotionRoll;
    h += rollLine(diceHTML(pr.rolls), esc(pr.skill) + ' (' + pr.attr + '): ' +
      (pr.ok ? pr.successes + ' success' + (pr.successes === 1 ? '' : 'es') + ' &mdash; promoted' : 'no successes &mdash; passed over'),
      pr.ok ? 'good' : 'bad');
    // The duplicate case is tested FIRST: it also has no specialtyGained yet, so the
    // roll-a-table branch below would otherwise swallow it and offer another roll.
    if (pr.ok && cur.duplicateSpecialty && !cur.specialtyGained) {
      h += '<div class="note">You rolled ' + esc(cur.duplicateSpecialty) +
        ', which you already have. Choose any specialty instead.</div>' + specialtyChooser();
      return h + '</div>';
    }
    if (pr.ok && !cur.specialtyGained) {
      var tables = E.specialtyTables(S);
      h += '<div class="panel-t" style="margin-top:12px">Roll a D6 for your specialty</div>' +
        (tables.length > 1 ? '<div class="note">As an officer you may roll on either column.</div>' : '') +
        tables.map(function (t, i) {
          return '<div class="opt" onclick="A.rollSpec(' + i + ')"><div class="opt-box"></div><div>' +
            '<div class="opt-n">' + esc(t.label) + ' column</div>' +
            '<div class="opt-d">' + esc(t.table.join(', ')) + '</div></div></div>';
        }).join('');
      return h + '</div>';
    }
    if (cur.specialtyGained) {
      h += rollLine(cur.specialtyRoll || '&#9733;', 'Specialty: <b>' + esc(cur.specialtyGained) + '</b>' +
        (cur.specialtyChosen ? ' (rolled a duplicate, so chosen instead)' : ''), 'good');
      if (cur.rankGained) h += rollLine('&#9733;', 'Promoted to ' + esc(cur.rankGained), 'good');
      if (cur.cufGained) h += rollLine('&#9733;', 'Coolness under fire rises to ' + cur.cufGained, 'good');
    }
    h += '</div>';
    h += '<div class="btn-row"><span></span><button class="btn" onclick="A.toAge()">Continue &rarr;</button></div>';
    return h;
  }

  function specialtyChooser() {
    var all = [];
    Object.keys(DATA.skills.specialties).forEach(function (g) {
      DATA.skills.specialties[g].forEach(function (x) {
        if (S.specialties.indexOf(x.name) < 0) all.push(x);
      });
    });
    return '<div class="spec-list">' + all.map(function (x) {
      return '<div class="opt" onclick="A.chooseSpec(\'' + esc(x.name) + '\')"><div class="opt-box"></div><div>' +
        '<div class="opt-n">' + esc(x.name) + '</div><div class="opt-d">' + esc(x.desc) + '</div></div></div>';
    }).join('') + '</div>';
  }

  function viewAge() {
    var cur = S.current;
    var h = '<div class="panel"><div class="term-hd"><div class="term-n">' + esc(cur.career.name) +
      '</div><div class="term-age">term ' + cur.termNo + '</div></div>';
    h += rollLine(cur.years, 'The term ran ' + cur.years + ' years. You are ' + S.age + '.');
    var ar = cur.ageRoll;
    h += rollLine(ar.roll, 'D8 against ' + ar.terms + ' term' + (ar.terms === 1 ? '' : 's') + ': ' +
      (ar.effect ? 'the years have told on you' : 'no effect'), ar.effect ? 'bad' : 'good');
    if (ar.effect && !cur.ageEffect && E.ageEffectPossible(S)) {
      h += '<div class="note">Reduce one attribute by one step. It cannot go below D.</div>' +
        '<div class="attrs">' + E.ATTRS.map(function (a) {
          var can = S.attrs[a] !== 'D';
          return '<div class="at" style="cursor:' + (can ? 'pointer' : 'not-allowed') + ';opacity:' + (can ? 1 : .4) +
            '" onclick="' + (can ? 'A.ageHit(\'' + a + '\')' : '') + '">' +
            '<div class="at-k">' + a + '</div><div class="at-v">' + S.attrs[a] + '</div>' +
            '<div class="at-d">&rarr; ' + (can ? E.stepDown(S.attrs[a]) : 'D') + '</div></div>';
        }).join('') + '</div></div>';
      return h;
    }
    if (cur.ageEffect) h += rollLine('&darr;', esc(cur.ageEffect) + ' drops to ' + S.attrs[cur.ageEffect], 'bad');
    if (ar.effect && !E.ageEffectPossible(S)) h += '<div class="note">Every attribute is already at D, so nothing more can be lost.</div>';

    if (cur.warRoll) {
      var wr = cur.warRoll;
      h += wr.militia
        ? rollLine('&#9888;', 'Local militia &mdash; the war reaches your home ground by the end of this term.', 'bad')
        : rollLine(wr.roll, 'D8 against ' + wr.terms + ' term' + (wr.terms === 1 ? '' : 's') + ': ' +
            (wr.war ? 'WAR BREAKS OUT' : 'not yet'), wr.war ? 'bad' : 'good');
      if (S.current.prisonPending) {
        h += rollLine(S.current.prisonPending.roll, 'Crime, and no war to hide behind: ' +
          (S.current.prisonPending.prison ? 'odd &mdash; prison next term' : 'even &mdash; you got away with it'),
          S.current.prisonPending.prison ? 'bad' : 'good');
      }
      h += '</div><div class="btn-row"><span></span><button class="btn" onclick="A.nextTerm()">' +
        (wr.war ? 'To the war &rarr;' : 'Next term &rarr;') + '</button></div>';
      return h;
    }
    h += '</div><div class="btn-row"><span></span><button class="btn" onclick="A.rollWar()">&#9860; Roll for war</button></div>';
    return h;
  }

  // ---- 5. the At War term ----
  function viewAtWar() {
    var cur = S.current;
    var forced = E.atWarForcedSkill(S);
    var drafted = E.draftApplies(S);
    var h = '<div class="step-h">At War</div>' +
      '<div class="step-p">World War III. Everyone was trying hard to just stay safe and do what they could for themselves, their families and their teammates. Raise any two skills one step each, then take one last specialty. No promotion, and no ageing.</div>';
    h += historyHTML();
    if (drafted) {
      h += '<div class="note warn"><b>Drafted.</b> Your last peacetime term was civilian and you are not a local, so you spend the war as a draftee or volunteer' +
        (forced ? ' &mdash; one of your two increases must be Ranged Combat' : '') +
        '. Your specialty is rolled on the Military column and your gear comes from Combat Arms.</div>';
    }
    if (!cur.atWarSpecialty) {
      h += '<div class="panel"><div class="panel-t">Training &mdash; ' + cur.increases.length + ' / 2</div>' +
        '<div class="note">Any two different skills, one step each. You cannot put both steps into one skill.</div>' +
        '<div class="skills-list">' + DATA.skills.skills.map(function (sk) {
          var on = cur.increases.indexOf(sk.name) >= 0;
          var can = E.canTakeAtWarIncrease(S, sk.name);
          return '<div class="opt' + (on ? ' on' : '') + (can || on ? '' : ' disabled') +
            '" onclick="' + (can ? 'A.atWarIncrease(\'' + esc(sk.name) + '\')' : '') + '">' +
            '<div class="opt-box">' + (on ? '&#10003;' : '') + '</div>' +
            '<div class="opt-n">' + esc(sk.name) + ' <span class="hist-r">' + E.skillLevel(S, sk.name) + '</span></div></div>';
        }).join('') + '</div></div>';
      if (cur.increases.length === 2) {
        h += '<div class="panel"><div class="panel-t">Final specialty &mdash; ' + esc(E.atWarColumn(S)) + ' column</div>' +
          '<div class="note">' + esc(E.atWarSpecialtyTable(S).join(', ')) + '</div>' +
          '<div class="btn-row tight"><button class="btn" onclick="A.rollAtWarSpec()">&#9860; Roll a D6</button></div></div>';
      }
      h += '<div class="btn-row"><button class="btn ghost"' + (cur.increases.length ? '' : ' disabled') +
        ' onclick="A.undoAtWar()">Undo</button><span></span></div>';
      return h;
    }
    h += '<div class="panel">' +
      rollLine(cur.atWarSpecRoll || '&#9733;', 'Specialty: <b>' + esc(cur.atWarSpecialty) + '</b>' +
        (cur.atWarChosen ? ' (rolled a duplicate, so chosen instead)' : ''), 'good') + '</div>';
    h += skillsPanel() + specialtiesPanel();
    h += '<div class="btn-row"><span></span><button class="btn" onclick="A.finishAtWar()">Continue &rarr;</button></div>';
    return h;
  }

  // ---- 6. final details ----
  function viewFinish() {
    var gs = E.gearSource(S);
    var h = '<div class="step-h">Final Details</div>' +
      '<div class="step-p">Hit and stress capacity come straight off your attributes. The rest is who you are when the shooting stops.</div>';
    h += '<div class="panel"><div class="panel-t">Capacities</div><div class="grid2">' +
      '<div><div class="sk"><span>Hit capacity</span><span class="sk-v">' + E.hitCapacity(S) + '</span></div>' +
      '<div class="sk"><span>Stress capacity</span><span class="sk-v">' + E.stressCapacity(S) + '</span></div></div>' +
      '<div><div class="sk"><span>Coolness under fire</span><span class="sk-v">' + S.cuf + '</span></div>' +
      '<div class="sk"><span>Your Command</span><span class="sk-v">' + E.unitMorale(S) + '</span></div></div>' +
      '</div><div class="note">Unit morale is a group score equal to the highest Command in the group, so it is settled at the table, not here.</div></div>';

    h += '<div class="panel"><div class="panel-t">Moral code</div>' +
      '<input class="txt" value="' + esc(S.moralCode) + '" oninput="A.set(\'moralCode\',this.value)" placeholder="One sentence">' +
      '<div class="note">' + DATA.core.moral_code_examples.map(function (x) {
        return '<div class="opt" onclick="A.setField(\'moralCode\',\'' + esc(x).replace(/'/g, '&#39;') + '\')">' +
          '<div class="opt-box"></div><div class="opt-n">' + esc(x) + '</div></div>';
      }).join('') + '</div></div>';

    h += '<div class="panel"><div class="panel-t">Big dream</div>' +
      '<input class="txt" value="' + esc(S.bigDream) + '" oninput="A.set(\'bigDream\',this.value)" placeholder="What keeps you on your feet">' +
      '<div class="note">' + DATA.core.big_dream_examples.map(function (x) {
        return '<div class="opt" onclick="A.setField(\'bigDream\',\'' + esc(x).replace(/'/g, '&#39;') + '\')">' +
          '<div class="opt-box"></div><div class="opt-n">' + esc(x) + '</div></div>';
      }).join('') + '</div></div>';

    h += '<div class="panel"><div class="panel-t">Your buddy, how you met, appearance</div><div class="grid2">' +
      '<div><label class="lbl">Buddy</label><input class="txt" value="' + esc(S.buddy) +
        '" oninput="A.set(\'buddy\',this.value)" placeholder="Another PC"></div>' +
      '<div><label class="lbl">Appearance</label><input class="txt" value="' + esc(S.appearance) +
        '" oninput="A.set(\'appearance\',this.value)" placeholder="A feature, clothing, a mannerism"></div>' +
      '</div><div style="margin-top:14px"><label class="lbl">How you met the others</label>' +
      '<input class="txt" value="' + esc(S.howMet) + '" oninput="A.set(\'howMet\',this.value)" placeholder="A sentence or two"></div></div>';

    h += '<div class="panel"><div class="panel-t">Starting gear &mdash; ' + esc(gs ? gs.name : 'none') + '</div>' +
      '<div class="note">From your last career term before the war. Where a line offers a choice, tick the one you took.</div>' +
      '<div class="skills-list">' + (gs ? gs.gear : []).map(function (g, i) {
        var on = S.gearPicks[i];
        return '<div class="opt' + (on ? ' on' : '') + '" onclick="A.gear(' + i + ')">' +
          '<div class="opt-box">' + (on ? '&#10003;' : '') + '</div><div class="opt-n">' + esc(g) + '</div></div>';
      }).join('') + '</div>' +
      (S.rations ? '<div class="note">Plus ' + ration(S.rations, 'ration') + ' of food, ' + ration(S.water, 'ration') +
        ' of fresh water and ' + ration(S.ammo, 'round') + ' of ammo as currency. Starting permanent rads: ' + S.rads +
        '. You also have a uniform or sturdy civilian clothing, and a canteen.</div>'
        : '<div class="btn-row tight"><button class="btn" onclick="A.rollSupplies()">&#9860; Roll supplies and rads</button></div>') +
      '</div>';

    h += '<div class="btn-row"><button class="btn ghost" onclick="A.restart()">Start over</button>' +
      '<button class="btn"' + (S.rations ? '' : ' disabled') + ' onclick="A.finish()">Finish &rarr;</button></div>';
    return h;
  }

  // ---- 7. dossier ----
  function viewDossier() {
    var gs = E.gearSource(S);
    var h = '<div class="step-h">' + esc(S.name || 'Unnamed') +
      (S.nickname ? ' &ldquo;' + esc(S.nickname) + '&rdquo;' : '') + '</div>' +
      '<div class="step-p">' + statusLine() + ' &middot; ' + esc(S.nationality) +
      (S.childhood ? ' &middot; ' + esc(S.childhood) : '') + '</div>';
    h += attrsPanel(false);
    h += '<div class="panel"><div class="panel-t">Capacities</div><div class="grid2">' +
      '<div><div class="sk"><span>Hit capacity</span><span class="sk-v">' + E.hitCapacity(S) + '</span></div>' +
      '<div class="sk"><span>Stress capacity</span><span class="sk-v">' + E.stressCapacity(S) + '</span></div></div>' +
      '<div><div class="sk"><span>Coolness under fire</span><span class="sk-v">' + S.cuf + '</span></div>' +
      '<div class="sk"><span>Permanent rads</span><span class="sk-v">' + S.rads + '</span></div></div></div></div>';
    h += historyHTML() + skillsPanel() + specialtiesPanel();
    if (gs) {
      h += '<div class="panel"><div class="panel-t">Gear &mdash; ' + esc(gs.name) + '</div><div class="skills-list">' +
        gs.gear.map(function (g, i) {
          return '<div class="sk"><span>' + (S.gearPicks[i] ? '' : '<span style="opacity:.45">') + esc(g) +
            (S.gearPicks[i] ? '' : '</span>') + '</span></div>';
        }).join('') + '</div>' +
        '<div class="note">Plus ' + ration(S.rations, 'ration') + ' of food, ' + S.water + ' of water, ' + ration(S.ammo, 'round') + ' as currency.</div></div>';
    }
    h += '<div class="btn-row"><button class="btn ghost" onclick="A.restart()">Start over</button>' +
      '<button class="btn" onclick="window.print()">Print sheet</button></div>';
    return h;
  }

  // ---- printed sheet (CSS recreation; no publisher artwork) ----
  function ration(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function f(label, val) {
    return '<div class="ps-f"><div class="ps-fl">' + esc(label) + '</div><div class="ps-fv">' + esc(val) + '</div></div>';
  }
  function printSheet() {
    var gs = E.gearSource(S);
    var skills = Object.keys(S.skills).sort();
    var h = '<div id="printsheet"><div class="ps">';
    h += '<div class="ps-top"><div class="ps-title">TWILIGHT: 2000</div><div class="ps-sub">CHARACTER RECORD</div></div>';
    h += '<div class="ps-box"><div class="ps-2"><div>' +
      f('Name', S.name + (S.nickname ? ' "' + S.nickname + '"' : '')) +
      f('Nationality', S.nationality) + f('Rank', E.rankName(S) || 'Civilian') +
      '</div><div>' + f('Age', S.age) + f('Childhood', S.childhood || '') +
      f('Terms', S.terms.length) + '</div></div></div>';

    h += '<div class="ps-band">Attributes</div><div class="ps-box"><div class="ps-at">' +
      E.ATTRS.map(function (a) {
        return '<div><div class="k">' + a + '</div><div class="v">' + S.attrs[a] +
          '</div><div class="d">D' + E.dieSize(S.attrs[a]) + '</div></div>';
      }).join('') +
      '<div><div class="k">CUF</div><div class="v">' + S.cuf + '</div><div class="d">D' + E.dieSize(S.cuf) + '</div></div>' +
      '</div><div class="ps-2" style="margin-top:8px"><div>' +
      f('Hit capacity', E.hitCapacity(S)) + f('Stress capacity', E.stressCapacity(S)) +
      '</div><div>' + f('Permanent rads', S.rads) + f('Unit morale', E.unitMorale(S) + ' (group)') + '</div></div></div>';

    h += '<div class="ps-band">Skills</div><div class="ps-box"><div class="ps-sk">' +
      (skills.length ? skills.map(function (k) {
        return '<div><span>' + esc(k) + '</span><span>' + S.skills[k] + '</span></div>';
      }).join('') : '<div>&mdash;</div>') + '</div></div>';

    h += '<div class="ps-band">Specialties</div><div class="ps-box"><div class="ps-sp">' +
      (S.specialties.length ? S.specialties.map(function (sp) {
        return '<div>' + esc(sp) + '</div>';
      }).join('') : '<div>&mdash;</div>') + '</div></div>';

    h += '<div class="ps-band">Life path</div><div class="ps-box"><table class="ps-hist">' +
      '<tr><th>Term</th><th>Career</th><th>Years</th><th>Outcome</th></tr>' +
      S.terms.map(function (t, i) {
        var out = [];
        if (t.promoted) out.push('promoted');
        if (t.specialtyGained) out.push(t.specialtyGained);
        if (t.atWarSpecialty) out.push(t.atWarSpecialty);
        if (t.ageEffect) out.push(t.ageEffect + ' reduced');
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(t.career.name) +
          (t.officerArea ? ' (' + esc(E.findCareer(S, t.officerArea).career.name) + ')' : '') +
          '</td><td>' + (t.years || '--') + '</td><td>' + esc(out.join(', ')) + '</td></tr>';
      }).join('') + '</table></div>';

    h += '<div class="ps-band">Gear</div><div class="ps-box"><div class="ps-gear">' +
      (gs ? gs.gear.filter(function (g, i) { return S.gearPicks[i]; }) : []).map(function (g) {
        return '<div>' + esc(g) + '</div>';
      }).join('') +
      '<div>' + ration(S.rations, 'ration') + ' of food</div><div>' + ration(S.water, 'ration') + ' of water</div>' +
      '<div>' + ration(S.ammo, 'round') + ' of ammo (currency)</div><div>Uniform or civilian clothing, canteen</div>' +
      '</div></div>';

    h += '<div class="ps-band">The person</div><div class="ps-box">' +
      f('Moral code', S.moralCode) + f('Big dream', S.bigDream) +
      f('Buddy', S.buddy) + f('How you met', S.howMet) + f('Appearance', S.appearance) + '</div>';

    h += '<div class="ps-foot">Twilight: 2000 is a trade mark of Free League Publishing. ' +
      'This is an unofficial, fan-made character generator, not affiliated with or endorsed by the rights holders. ' +
      'All game rules and content remain the property of their respective owners.</div>';
    h += '</div></div>';
    return h;
  }

  // ---------------- actions ----------------
  var A = {};
  A.set = function (k, v) { S[k] = v; };
  A.setField = function (k, v) { S[k] = v; render(); };
  A.rerender = function () { render(); };
  A.go = function (p) {
    if (p === 'terms' && !S.sub) S.sub = 'pick';
    S.phase = p; render();
  };
  A.restart = function () { fresh(); lastView = null; render(); };
  A.__peek = function () { return S; };

  function rollName() {
    var pool = DATA.names.names[S.nationality] || DATA.names.names['United States'];
    return S.rng.pick(pool.given) + ' ' + S.rng.pick(pool.family);
  }
  A.randName = function () {
    S.name = rollName();
    S.nickname = S.rng.pick(DATA.names.nicknames);
    var n = document.querySelector('.name-inp'), k = document.querySelector('.nick-inp');
    if (n) n.value = S.name;            // written straight to the inputs: no re-render, so
    if (k) k.value = S.nickname;        // nothing else the user was typing gets clobbered
  };
  A.toggleMilitia = function () { S.localMilitia = !S.localMilitia; render(); };

  A.attrUp = function (a) { E.raiseAttr(S, a); render(); };
  A.attrDown = function (a) { E.lowerAttr(S, a); render(); };
  A.toggleTrade = function () {
    if (S.tradedDown) E.undoTradeDown(S);
    else {
      // trade the first attribute still sitting at C; the player can move it after
      for (var i = 0; i < E.ATTRS.length; i++) if (E.tradeDown(S, E.ATTRS[i])) break;
    }
    render();
  };

  A.rollChildhood = function () {
    var d = S.rng.d6();
    A.childhood(d, d);
  };
  A.childhood = function (d6, rolled) {
    var row = DATA.core.childhood.table[d6 - 1];
    S.childhoodRow = row;
    S.childhood = row.name;
    S.childhoodRoll = rolled || null;
    S.childhoodSkill = null;
    S.childhoodSpecialty = null;
    render();
  };
  A.resetChildhood = function () {
    if (S.childhoodSkill) E.lowerSkill(S, S.childhoodSkill);
    if (S.childhoodSpecialty) S.specialties.splice(S.specialties.indexOf(S.childhoodSpecialty), 1);
    S.childhood = null; S.childhoodRow = null; S.childhoodRoll = null;
    S.childhoodSkill = null; S.childhoodSpecialty = null;
    render();
  };
  A.childhoodSkill = function (sk) {
    if (S.childhoodSkill) E.lowerSkill(S, S.childhoodSkill);
    E.raiseSkill(S, sk);
    S.childhoodSkill = sk;
    render();
  };
  A.rollChildSpec = function () {
    var d = S.rng.d6();
    S.childhoodSpecRoll = d;
    S.childhoodSpecialty = S.childhoodRow.specialties[d - 1];
    E.gainSpecialty(S, S.childhoodSpecialty);
    render();
  };

  A.pickCareer = function (k) {
    if (k !== 'officer') { startTerm(k, null); return; }
    // An officer serves in a functional area and must qualify for that too, so the
    // area is asked for before the term starts.
    var areas = E.officerAreas(S);
    if (areas.length === 1) { startTerm(k, areas[0].key); return; }
    S.pendingCareer = k;
    S.askArea = areas;
    render();
  };
  A.pickArea = function (areaKey) { startTerm('officer', areaKey); };
  A.cancelArea = function () { S.askArea = null; S.pendingCareer = null; render(); };
  function startTerm(k, area) {
    S.pendingCareer = null; S.pendingArea = null; S.askArea = null;
    E.beginTerm(S, k, area);
    S.sub = 'train';
    render();
  }

  A.increase = function (sk) { E.takeIncrease(S, sk); render(); };
  A.undoIncrease = function () { E.undoIncrease(S); render(); };
  A.toPromotion = function () { S.sub = 'promote'; render(); };

  A.promote = function (sk) {
    var pr = E.promotionRoll(S, sk);
    if (!pr.ok) { S.current.specialtyGained = null; }
    render();
  };
  A.rollSpec = function (tableIdx) {
    var t = E.specialtyTables(S)[tableIdx];
    var sp = E.rollSpecialty(S, t.table);
    S.current.specialtyRoll = sp.roll;
    if (sp.duplicate) {
      S.current.duplicateSpecialty = sp.specialty;
    } else {
      applyGain(sp.specialty, false);
    }
    render();
  };
  A.chooseSpec = function (name) { applyGain(name, true); render(); };
  function applyGain(name, chosen) {
    var cur = S.current;
    E.gainSpecialty(S, name);
    cur.specialtyGained = name;
    cur.specialtyChosen = chosen;
    cur.duplicateSpecialty = null;
    var rankBefore = S.rankIndex, cufBefore = S.cuf;
    E.applyPromotion(S);
    if (S.rankIndex !== rankBefore) cur.rankGained = E.rankName(S);
    if (S.cuf !== cufBefore) cur.cufGained = S.cuf;
  }

  A.toAge = function () {
    S.sub = 'age';
    E.ageTerm(S);
    render();
  };
  A.ageHit = function (a) { E.applyAgeEffect(S, a); render(); };
  A.rollWar = function () {
    E.warRoll(S);
    // The prison check belongs to closeTerm, but the player should see it on this
    // screen, so it is previewed here and the engine's own roll is suppressed.
    var cur = S.current;
    if (cur.group.key === 'crime' && !cur.warRoll.war) {
      var d = S.rng.d6();
      cur.prisonPending = { roll: d, prison: d % 2 === 1 };
    }
    render();
  };
  A.nextTerm = function () {
    var war = S.current.warRoll.war;
    E.closeTerm(S);          // reuses current.prisonPending, so prison is not re-rolled
    if (war) { E.beginAtWar(S); S.phase = 'atwar'; S.sub = null; }
    else { S.sub = 'pick'; }
    render();
  };

  A.atWarIncrease = function (sk) {
    if (!E.canTakeAtWarIncrease(S, sk)) return;
    E.raiseSkill(S, sk);
    S.current.increases.push(sk);
    render();
  };
  A.undoAtWar = function () {
    var n = S.current.increases.pop();
    if (n) E.lowerSkill(S, n);
    render();
  };
  A.rollAtWarSpec = function () {
    var sp = E.rollSpecialty(S, E.atWarSpecialtyTable(S));
    S.current.atWarSpecRoll = sp.roll;
    if (sp.duplicate) {
      // "Re-roll if you get a specialty you already have" -- re-roll until it lands
      // on a free one, then fall back to any free specialty if the column is exhausted.
      var guard = 0, table = E.atWarSpecialtyTable(S);
      while (sp.duplicate && guard++ < 30) sp = E.rollSpecialty(S, table);
      if (sp.duplicate) {
        var all = [];
        Object.keys(DATA.skills.specialties).forEach(function (g) {
          DATA.skills.specialties[g].forEach(function (x) {
            if (S.specialties.indexOf(x.name) < 0) all.push(x.name);
          });
        });
        if (all.length) { sp = { specialty: S.rng.pick(all), roll: '--', duplicate: false }; }
      }
      S.current.atWarChosen = true;
      S.current.atWarSpecRoll = sp.roll;
    }
    S.current.atWarSpecialty = sp.specialty;
    E.gainSpecialty(S, sp.specialty);
    render();
  };
  A.finishAtWar = function () {
    E.closeAtWar(S);
    S.phase = 'finish'; S.sub = null;
    render();
  };

  A.gear = function (i) { S.gearPicks[i] = !S.gearPicks[i]; render(); };
  A.rollSupplies = function () { E.rollFinalSupplies(S); render(); };
  A.finish = function () { S.phase = 'done'; S.sub = null; render(); };

  // ---------------- randomise ----------------
  A.randomise = function () {
    fresh();
    S.nationality = S.rng.pick(DATA.core.nationality.options);
    S.localMilitia = S.rng.next() < 0.12;
    S.name = rollName();
    S.nickname = S.rng.pick(DATA.names.nicknames);

    if (S.rng.next() < 0.3) E.tradeDown(S, S.rng.pick(E.ATTRS));
    var g = 0;
    while (S.attrIncreasesLeft > 0 && g++ < 40) {
      var a = S.rng.pick(E.ATTRS);
      if (E.canRaiseAttr(S, a)) E.raiseAttr(S, a);
      else if (!E.ATTRS.filter(function (x) { return E.canRaiseAttr(S, x); }).length) break;
    }

    A.childhood(S.rng.d6(), S.rng.d6());
    A.childhoodSkill(S.rng.pick(S.childhoodRow.skills));
    A.rollChildSpec();

    var guard = 0;
    while (!S.war && guard++ < 15) {
      var opts = E.careerOptions(S).filter(function (o) { return o.ok; });
      if (!opts.length) break;
      var choice = S.prisonNext
        ? E.careerOptions(S).filter(function (o) { return o.career.key === 'prisoner'; })[0]
        : S.rng.pick(opts);
      var area = null;
      if (choice.career.key === 'officer') {
        var areas = E.officerAreas(S);
        if (!areas.length) continue;
        area = S.rng.pick(areas).key;
      }
      E.beginTerm(S, choice.career.key, area);
      var pool = E.termSkillOptions(S, S.current.career, S.current.group);
      if (S.current.firstMilitary) E.takeIncrease(S, 'Ranged Combat');
      var ig = 0;
      while (E.increasesRemaining(S) > 0 && ig++ < 30) {
        var free = pool.filter(function (p) { return E.canTakeIncrease(S, p); });
        if (!free.length) {
          free = DATA.skills.skills.map(function (s) { return s.name; })
            .filter(function (p) { return E.canTakeIncrease(S, p); });
          if (!free.length) break;
        }
        E.takeIncrease(S, S.rng.pick(free));
      }
      if (S.current.increases.length) {
        var pr = E.promotionRoll(S, S.rng.pick(S.current.increases));
        if (pr.ok) {
          var tables = E.specialtyTables(S);
          var sp = E.rollSpecialty(S, S.rng.pick(tables).table);
          S.current.specialtyRoll = sp.roll;
          if (sp.duplicate) {
            var all = [];
            Object.keys(DATA.skills.specialties).forEach(function (gg) {
              DATA.skills.specialties[gg].forEach(function (x) {
                if (S.specialties.indexOf(x.name) < 0) all.push(x.name);
              });
            });
            applyGain(all.length ? S.rng.pick(all) : sp.specialty, true);
          } else {
            applyGain(sp.specialty, false);
          }
        }
      }
      E.ageTerm(S);
      if (S.current.ageRoll.effect && E.ageEffectPossible(S)) {
        E.applyAgeEffect(S, S.rng.pick(E.ATTRS.filter(function (x) { return S.attrs[x] !== 'D'; })));
      }
      E.warRoll(S);
      E.closeTerm(S);
    }

    E.beginAtWar(S);
    var forced = E.atWarForcedSkill(S);
    if (forced && E.canTakeAtWarIncrease(S, forced)) { E.raiseSkill(S, forced); S.current.increases.push(forced); }
    var ag = 0;
    while (S.current.increases.length < 2 && ag++ < 30) {
      var free2 = DATA.skills.skills.map(function (s) { return s.name; })
        .filter(function (p) { return E.canTakeAtWarIncrease(S, p); });
      if (!free2.length) break;
      var pick2 = S.rng.pick(free2);
      E.raiseSkill(S, pick2); S.current.increases.push(pick2);
    }
    A.rollAtWarSpec();
    E.closeAtWar(S);

    var gsrc = E.gearSource(S);
    if (gsrc) for (var i = 0; i < gsrc.gear.length; i++) S.gearPicks[i] = true;
    E.rollFinalSupplies(S);
    S.moralCode = S.rng.pick(DATA.core.moral_code_examples);
    S.bigDream = S.rng.pick(DATA.core.big_dream_examples);
    S.phase = 'done'; S.sub = null;
    lastView = null;
    render();
  };

  window.A = A;

  // theme
  window.setTheme = function (t) {
    if (t === 'light') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('twilight2000_theme', t); } catch (e) {}
    syncTheme();
  };
  function syncTheme() {
    var t = document.documentElement.getAttribute('data-theme') || 'light';
    var b = document.querySelectorAll('.tt-btn');
    for (var i = 0; i < b.length; i++) b[i].classList.toggle('active', b[i].getAttribute('data-tv') === t);
  }

  window.addEventListener('DOMContentLoaded', function () {
    main = document.getElementById('main');
    track = document.getElementById('track');
    fresh();
    render();
    syncTheme();
  });
})();
