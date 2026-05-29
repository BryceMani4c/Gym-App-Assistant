// ══════════════════════════════════════════════════════════
//  GymTrack — app.js
//  Strong-inspired workout tracker with analytics
//  Storage: localStorage (GitHub Pages compatible)
// ══════════════════════════════════════════════════════════

'use strict'

// ── Storage ────────────────────────────────────────────────
function load(key, fallback) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback }
    catch { return fallback }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)) }

// ── App Data ───────────────────────────────────────────────
let arrRoutines = load('gt_routines', [])
let arrHistory  = load('gt_history',  [])

// ── Active workout state ───────────────────────────────────
let objActive = null            // running workout object
let intWorkoutInterval  = null  // elapsed timer
let intRestInterval     = null  // rest countdown
let intRestTotal        = 0     // total seconds for current rest
let intRestLeft         = 0     // seconds remaining

// ── Template editor state ──────────────────────────────────
let objEditRoutine    = null    // routine being edited
let intEditRoutineIdx = -1      // index in arrRoutines (-1 = new)
let intEditExerciseIdx = -1     // exercise slot being configured
let fnPickerCallback  = null    // called with chosen exercise name

// ── Exercise detail state ──────────────────────────────────
let strDetailExercise   = ''
let objDetailChart      = null
let strDetailChartType  = 'oneRM'

// ── Chart references ───────────────────────────────────────
let objVolumeChart = null
let objFreqChart   = null

// ══════════════════════════════════════════════════════════
//  Exercise library (categorized)
// ══════════════════════════════════════════════════════════
const EXERCISES = {
    'Chest':      ['Bench Press','Incline Bench Press','Decline Bench Press','Dumbbell Fly','Cable Fly','Chest Dip','Push Up','Pec Deck'],
    'Back':       ['Deadlift','Barbell Row','Seated Cable Row','Lat Pulldown','Pull Up','Chin Up','T-Bar Row','Single Arm Dumbbell Row','Face Pull','Straight Arm Pulldown'],
    'Shoulders':  ['Overhead Press','Arnold Press','Dumbbell Shoulder Press','Lateral Raise','Front Raise','Rear Delt Fly','Upright Row','Shrug'],
    'Legs':       ['Squat','Leg Press','Hack Squat','Romanian Deadlift','Leg Extension','Leg Curl','Calf Raise','Bulgarian Split Squat','Step Up','Hip Thrust','Glute Bridge'],
    'Arms':       ['Bicep Curl','Hammer Curl','Preacher Curl','Cable Curl','Concentration Curl','Tricep Pushdown','Skull Crusher','Overhead Tricep Extension','Close Grip Bench Press','Dips'],
    'Core':       ['Plank','Crunch','Leg Raise','Russian Twist','Ab Wheel','Cable Crunch','Hanging Leg Raise','Pallof Press'],
    'Cardio':     ['Treadmill','Rowing Machine','Stationary Bike','Elliptical','Stair Climber'],
    'Other':      ['Farmer Carry','Sled Push','Battle Ropes','Box Jump','Kettlebell Swing','Trap Bar Deadlift']
}
const ALL_EXERCISES = Object.values(EXERCISES).flat()

// ══════════════════════════════════════════════════════════
//  Utilities
// ══════════════════════════════════════════════════════════
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,5) }

function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = sec % 60
    return `${m}:${s.toString().padStart(2,'0')}`
}

function fmtDate(iso) {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' })
}

function fmtShortDate(iso) {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
}

// Epley 1RM estimate
function calc1RM(weight, reps) {
    if (reps === 1) return weight
    if (!weight || !reps) return 0
    return Math.round(weight * (1 + reps / 30))
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatVolume(vol) {
    if (vol >= 1000) return `${(vol/1000).toFixed(1)}k`
    return String(vol)
}

// ══════════════════════════════════════════════════════════
//  Navigation
// ══════════════════════════════════════════════════════════
function showPage(id) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.add('d-none'))
    document.getElementById(id).classList.remove('d-none')

    const TAB_PAGES = ['pageWorkouts','pageHistory','pageExercises','pageAnalytics']
    const NO_NAV    = ['pageTemplateEditor','pageActiveWorkout','pageExerciseDetail']

    document.getElementById('navBottom').style.display = NO_NAV.includes(id) ? 'none' : ''
    document.body.style.paddingBottom = NO_NAV.includes(id) ? '0' : ''

    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === id)
    })

    if (id === 'pageWorkouts')  renderWorkoutsPage()
    if (id === 'pageHistory')   renderHistoryPage()
    if (id === 'pageExercises') renderExerciseLibrary()
    if (id === 'pageAnalytics') renderAnalyticsPage()
}

document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page))
})

// ══════════════════════════════════════════════════════════
//  Workouts Page
// ══════════════════════════════════════════════════════════
function renderWorkoutsPage() {
    const divList = document.getElementById('divRoutineList')
    const divNone = document.getElementById('divNoRoutines')

    if (!arrRoutines.length) {
        divList.innerHTML = ''
        divNone.classList.remove('d-none')
        return
    }
    divNone.classList.add('d-none')

    divList.innerHTML = arrRoutines.map((r, i) => {
        const strExNames = r.exercises.map(e => escHtml(e.name)).join(' · ')
        return `
        <div class="routine-card">
            <div class="flex-grow-1" onclick="startWorkout(${i})">
                <div class="routine-card-name">${escHtml(r.name)}</div>
                <div class="routine-card-meta">${r.exercises.length} exercise${r.exercises.length!==1?'s':''} ${r.notes ? '· '+escHtml(r.notes) : ''}</div>
                <div class="routine-card-exercises">${strExNames}</div>
            </div>
            <button class="btn-icon" onclick="openTemplateEditor(${i})" title="Edit">
                <i class="bi bi-pencil" style="font-size:1rem"></i>
            </button>
        </div>`
    }).join('')
}

document.getElementById('btnNewRoutine').addEventListener('click', () => openTemplateEditor(-1))
document.getElementById('btnEmptyWorkout').addEventListener('click', () => startEmptyWorkout())

// ══════════════════════════════════════════════════════════
//  Template Editor
// ══════════════════════════════════════════════════════════
function openTemplateEditor(intIdx) {
    intEditRoutineIdx = intIdx
    if (intIdx === -1) {
        objEditRoutine = { id: uid(), name: '', notes: '', exercises: [] }
        document.getElementById('headingTemplateEditor').textContent = 'New Routine'
        document.getElementById('btnDeleteRoutine').classList.add('d-none')
    } else {
        objEditRoutine = JSON.parse(JSON.stringify(arrRoutines[intIdx]))
        document.getElementById('headingTemplateEditor').textContent = 'Edit Routine'
        document.getElementById('btnDeleteRoutine').classList.remove('d-none')
    }
    document.getElementById('txtRoutineName').value  = objEditRoutine.name
    document.getElementById('txtRoutineNotes').value = objEditRoutine.notes || ''
    renderTemplateExercises()
    showPage('pageTemplateEditor')
}

function renderTemplateExercises() {
    const div  = document.getElementById('divTemplateExercises')
    const none = document.getElementById('divNoTemplateExercises')

    if (!objEditRoutine.exercises.length) {
        div.innerHTML = ''
        none.classList.remove('d-none')
        return
    }
    none.classList.add('d-none')

    div.innerHTML = objEditRoutine.exercises.map((ex, i) => `
        <div class="gt-card mb-2">
            <div class="gt-card-header">
                <div>
                    <div style="font-weight:700">${escHtml(ex.name)}</div>
                    <div style="font-size:0.78rem;color:var(--text2)">
                        ${ex.sets} sets · ${ex.reps} reps
                        ${ex.weight > 0 ? `· ${ex.weight} lb` : ''}
                        ${ex.restSeconds > 0 ? `· ${fmtTime(ex.restSeconds)} rest` : ''}
                    </div>
                </div>
                <div class="d-flex gap-2 align-items-center">
                    <button class="btn-icon" onclick="editTemplateExercise(${i})" title="Edit"><i class="bi bi-sliders" style="font-size:1rem"></i></button>
                    <button class="btn-icon" onclick="removeTemplateExercise(${i})" style="color:var(--red)" title="Remove"><i class="bi bi-trash" style="font-size:1rem"></i></button>
                </div>
            </div>
        </div>
    `).join('')
}

document.getElementById('btnAddExerciseToTemplate').addEventListener('click', () => {
    openExercisePicker(strName => {
        intEditExerciseIdx = -1
        objEditRoutine.exercises.push({ name: strName, sets: 3, reps: 10, weight: 0, restSeconds: 90 })
        renderTemplateExercises()
    })
})

function editTemplateExercise(i) {
    intEditExerciseIdx = i
    const ex = objEditRoutine.exercises[i]
    document.getElementById('modalConfigTitle').textContent = escHtml(ex.name)
    document.getElementById('cfgSets').value   = ex.sets
    document.getElementById('cfgReps').value   = ex.reps
    document.getElementById('cfgWeight').value = ex.weight
    document.getElementById('cfgRest').value   = ex.restSeconds
    new bootstrap.Modal(document.getElementById('modalExerciseConfig')).show()
}

function removeTemplateExercise(i) {
    objEditRoutine.exercises.splice(i, 1)
    renderTemplateExercises()
}

document.getElementById('btnSaveExerciseConfig').addEventListener('click', () => {
    const ex = objEditRoutine.exercises[intEditExerciseIdx]
    ex.sets        = parseInt(document.getElementById('cfgSets').value) || 3
    ex.reps        = parseInt(document.getElementById('cfgReps').value) || 10
    ex.weight      = parseFloat(document.getElementById('cfgWeight').value) || 0
    ex.restSeconds = parseInt(document.getElementById('cfgRest').value) || 0
    bootstrap.Modal.getInstance(document.getElementById('modalExerciseConfig')).hide()
    renderTemplateExercises()
})

document.getElementById('btnSaveRoutine').addEventListener('click', () => {
    const strName = document.getElementById('txtRoutineName').value.trim()
    if (!strName) { return Swal.fire({ icon:'warning', title:'Name required', confirmButtonColor:'var(--accent)' }) }

    objEditRoutine.name  = strName
    objEditRoutine.notes = document.getElementById('txtRoutineNotes').value.trim()

    if (intEditRoutineIdx === -1) arrRoutines.push(objEditRoutine)
    else arrRoutines[intEditRoutineIdx] = objEditRoutine

    save('gt_routines', arrRoutines)
    showPage('pageWorkouts')
})

document.getElementById('btnDeleteRoutine').addEventListener('click', () => {
    Swal.fire({
        title: `Delete "${objEditRoutine.name}"?`,
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'Delete', confirmButtonColor: 'var(--red)',
        cancelButtonText: 'Cancel'
    }).then(r => {
        if (r.isConfirmed) {
            arrRoutines.splice(intEditRoutineIdx, 1)
            save('gt_routines', arrRoutines)
            showPage('pageWorkouts')
        }
    })
})

document.getElementById('btnBackFromEditor').addEventListener('click', () => showPage('pageWorkouts'))

// ══════════════════════════════════════════════════════════
//  Exercise Picker Modal
// ══════════════════════════════════════════════════════════
const elPickerModal = document.getElementById('modalExercisePicker')
const bsPickerModal = new bootstrap.Modal(elPickerModal)

function openExercisePicker(callback) {
    fnPickerCallback = callback
    document.getElementById('txtPickerSearch').value = ''
    renderPickerList('')
    bsPickerModal.show()
    setTimeout(() => document.getElementById('txtPickerSearch').focus(), 400)
}

function renderPickerList(strQuery) {
    const div = document.getElementById('divPickerCategories')
    const q   = strQuery.toLowerCase().trim()

    let html = ''
    for (const [cat, arr] of Object.entries(EXERCISES)) {
        const filtered = q ? arr.filter(n => n.toLowerCase().includes(q)) : arr
        if (!filtered.length) continue
        html += `<div class="picker-category-label">${escHtml(cat)}</div>`
        html += filtered.map(n =>
            `<div class="picker-exercise-row" onclick="pickExercise('${escHtml(n)}')">${escHtml(n)}</div>`
        ).join('')
    }

    // Custom entry if no match
    if (q && !ALL_EXERCISES.some(n => n.toLowerCase() === q)) {
        html += `<div class="picker-category-label">CUSTOM</div>
                 <div class="picker-exercise-row" onclick="pickExercise('${escHtml(strQuery.trim())}')">
                     <i class="bi bi-plus-lg text-accent me-2"></i>${escHtml(strQuery.trim())}
                 </div>`
    }

    div.innerHTML = html || '<div class="text-muted small py-2">No exercises found.</div>'
}

document.getElementById('txtPickerSearch').addEventListener('input', e => renderPickerList(e.target.value))

function pickExercise(strName) {
    bsPickerModal.hide()
    if (fnPickerCallback) fnPickerCallback(strName)
}

// ══════════════════════════════════════════════════════════
//  PR Detection
// ══════════════════════════════════════════════════════════

// Returns { weight, reps, oneRM } best ever for an exercise
function getBestSet(strExName) {
    let best = null
    for (const session of arrHistory) {
        for (const ex of session.exercises) {
            if (ex.name !== strExName) continue
            for (const s of ex.sets) {
                const est = calc1RM(s.weight, s.reps)
                if (!best || est > best.oneRM) {
                    best = { weight: s.weight, reps: s.reps, oneRM: est }
                }
            }
        }
    }
    return best
}

// Check if a set is a new PR
function isNewPR(strExName, weight, reps) {
    const best = getBestSet(strExName)
    if (!best) return false
    return calc1RM(weight, reps) > best.oneRM
}

// Previous session performance for a given exercise (array of sets)
function getPrevPerformance(strExName) {
    for (const session of arrHistory) {
        const ex = session.exercises.find(e => e.name === strExName)
        if (ex && ex.sets.length) return ex.sets
    }
    return null
}

// ══════════════════════════════════════════════════════════
//  Active Workout
// ══════════════════════════════════════════════════════════
function startEmptyWorkout() {
    initActiveWorkout('Workout', [])
}

function startWorkout(intIdx) {
    const r = arrRoutines[intIdx]
    if (!r.exercises.length) {
        return Swal.fire({ icon:'info', title:'No exercises', text:'Edit this routine first.', confirmButtonColor:'var(--accent)' })
    }
    const exercises = r.exercises.map(ex => ({
        name: ex.name,
        restSeconds: ex.restSeconds,
        sets: Array.from({ length: ex.sets }, () => ({
            targetReps: ex.reps, targetWeight: ex.weight,
            actualReps: ex.reps, actualWeight: ex.weight,
            done: false
        }))
    }))
    initActiveWorkout(r.name, exercises)
}

function initActiveWorkout(strName, exercises) {
    objActive = {
        name:      strName,
        startTime: new Date().toISOString(),
        exercises
    }
    document.getElementById('headingActiveWorkout').textContent = strName
    renderActiveWorkout()
    showPage('pageActiveWorkout')
    clearInterval(intWorkoutInterval)
    intWorkoutInterval = setInterval(() => {
        if (!objActive) return
        const sec = Math.floor((Date.now() - new Date(objActive.startTime)) / 1000)
        document.getElementById('spanWorkoutTimer').textContent = fmtTime(sec)
    }, 1000)
}

function renderActiveWorkout() {
    const div = document.getElementById('divActiveExerciseList')
    div.innerHTML = objActive.exercises.map((ex, ei) => buildExerciseCard(ex, ei)).join('')
}

function buildExerciseCard(ex, ei) {
    const arrPrev = getPrevPerformance(ex.name)

    const setRows = ex.sets.map((s, si) => {
        const prevSet = arrPrev ? arrPrev[si] : null
        const strPrev = prevSet
            ? `${prevSet.weight > 0 ? prevSet.weight+'lb' : 'BW'} × ${prevSet.reps}`
            : '–'
        return `
        <div class="set-row ${s.done ? 'set-done' : ''}" id="setRow_${ei}_${si}">
            <span class="set-num">${si+1}</span>
            <span class="set-prev">${escHtml(strPrev)}</span>
            <input type="number" class="set-input" id="inpWeight_${ei}_${si}"
                value="${s.actualWeight}" min="0" step="2.5"
                onchange="updateSetField(${ei},${si},'actualWeight',this.value)">
            <input type="number" class="set-input" id="inpReps_${ei}_${si}"
                value="${s.actualReps}" min="0"
                onchange="updateSetField(${ei},${si},'actualReps',this.value)">
            <button class="btn-set-done" id="btnDone_${ei}_${si}"
                onclick="toggleSetDone(${ei},${si})">
                ${s.done ? '<i class="bi bi-check-lg"></i>' : ''}
            </button>
        </div>`
    }).join('')

    return `
    <div class="active-exercise-card" id="exCard_${ei}">
        <div class="active-exercise-header">
            <span class="active-exercise-name">${escHtml(ex.name)}</span>
            <div class="d-flex gap-2 align-items-center">
                <span class="text-muted" style="font-size:0.75rem" id="exProgress_${ei}">
                    ${ex.sets.filter(s=>s.done).length}/${ex.sets.length}
                </span>
                <button class="btn-icon" style="font-size:0.9rem;color:var(--red)"
                    onclick="removeActiveExercise(${ei})" title="Remove">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
        <div class="set-col-headers">
            <span>Set</span><span>Previous</span><span>lbs</span><span>Reps</span><span></span>
        </div>
        ${setRows}
        <button class="btn-add-set" onclick="addSetToExercise(${ei})">
            <i class="bi bi-plus-lg"></i> Add Set
        </button>
    </div>`
}

function updateSetField(ei, si, field, val) {
    objActive.exercises[ei].sets[si][field] = parseFloat(val) || 0
}

function toggleSetDone(ei, si) {
    const s   = objActive.exercises[ei].sets[si]
    const ex  = objActive.exercises[ei]
    s.done    = !s.done

    // Read current input values
    s.actualWeight = parseFloat(document.getElementById(`inpWeight_${ei}_${si}`).value) || 0
    s.actualReps   = parseInt(document.getElementById(`inpReps_${ei}_${si}`).value)   || 0

    const row = document.getElementById(`setRow_${ei}_${si}`)
    const btn = document.getElementById(`btnDone_${ei}_${si}`)

    if (s.done) {
        row.classList.add('set-done')
        btn.innerHTML = '<i class="bi bi-check-lg"></i>'

        // PR check
        if (isNewPR(ex.name, s.actualWeight, s.actualReps)) {
            btn.classList.add('pr-flash')
            setTimeout(() => btn.classList.remove('pr-flash'), 600)
            Swal.fire({
                icon:'success', title:'New PR! 🏆',
                html:`<b>${escHtml(ex.name)}</b><br>${s.actualWeight}lb × ${s.actualReps} reps<br>Est. 1RM: <b>${calc1RM(s.actualWeight, s.actualReps)} lb</b>`,
                timer: 3000, showConfirmButton: false,
                background:'var(--surface)', color:'var(--text)'
            })
        }

        // Rest timer — only if not last set
        const blnLastSet = si === ex.sets.length - 1
        if (ex.restSeconds > 0 && !blnLastSet) startRestTimer(ex.restSeconds)
    } else {
        row.classList.remove('set-done')
        btn.innerHTML = ''
    }

    // Update progress
    document.getElementById(`exProgress_${ei}`).textContent =
        `${ex.sets.filter(s=>s.done).length}/${ex.sets.length}`
}

function addSetToExercise(ei) {
    const ex   = objActive.exercises[ei]
    const last = ex.sets[ex.sets.length - 1]
    ex.sets.push({
        targetReps: last?.targetReps || 10, targetWeight: last?.targetWeight || 0,
        actualReps: last?.actualReps || 10, actualWeight: last?.actualWeight || 0,
        done: false
    })
    // Re-render just this card
    document.getElementById(`exCard_${ei}`).outerHTML = buildExerciseCard(ex, ei)
}

function removeActiveExercise(ei) {
    objActive.exercises.splice(ei, 1)
    renderActiveWorkout()
}

// Add exercise during workout
document.getElementById('btnAddExerciseDuringWorkout').addEventListener('click', () => {
    openExercisePicker(strName => {
        objActive.exercises.push({
            name: strName, restSeconds: 90,
            sets: [{ targetReps:10, targetWeight:0, actualReps:10, actualWeight:0, done:false }]
        })
        renderActiveWorkout()
        // Scroll to bottom
        setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50)
    })
})

// ── Rest Timer ─────────────────────────────────────────────
function startRestTimer(intSec) {
    clearInterval(intRestInterval)
    intRestTotal = intSec
    intRestLeft  = intSec

    const bar   = document.getElementById('restTimerBar')
    const fill  = document.getElementById('restProgressFill')
    bar.classList.remove('d-none')
    fill.style.width = '100%'
    updateRestDisplay()

    intRestInterval = setInterval(() => {
        intRestLeft--
        updateRestDisplay()
        fill.style.width = `${(intRestLeft / intRestTotal) * 100}%`
        if (intRestLeft <= 0) {
            clearInterval(intRestInterval)
            bar.classList.add('d-none')
            playBeep()
        }
    }, 1000)
}

function updateRestDisplay() {
    document.getElementById('spanRestCountdown').textContent = fmtTime(intRestLeft)
}

function stopRestTimer() {
    clearInterval(intRestInterval)
    document.getElementById('restTimerBar').classList.add('d-none')
}

document.getElementById('btnSkipRest').addEventListener('click', stopRestTimer)

document.getElementById('btnRestAdd15').addEventListener('click', () => {
    intRestLeft  += 15
    intRestTotal = Math.max(intRestTotal, intRestLeft)
    updateRestDisplay()
    document.getElementById('restProgressFill').style.width =
        `${(intRestLeft / intRestTotal) * 100}%`
})

function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        ;[0, 0.15, 0.3].forEach(offset => {
            const osc = ctx.createOscillator(), g = ctx.createGain()
            osc.connect(g); g.connect(ctx.destination)
            osc.frequency.value = 880
            g.gain.setValueAtTime(0.3, ctx.currentTime + offset)
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.12)
            osc.start(ctx.currentTime + offset)
            osc.stop(ctx.currentTime + offset + 0.15)
        })
    } catch {}
}

// ── Finish / Cancel ────────────────────────────────────────
document.getElementById('btnFinishWorkout').addEventListener('click', () => {
    const intDone = objActive.exercises.reduce((n,ex) => n + ex.sets.filter(s=>s.done).length, 0)
    Swal.fire({
        title: 'Finish Workout?',
        text: `${intDone} set${intDone!==1?'s':''} completed`,
        icon: 'question', showCancelButton: true,
        confirmButtonText: 'Finish', confirmButtonColor: 'var(--green)',
        cancelButtonText: 'Keep Going'
    }).then(r => { if (r.isConfirmed) finishWorkout() })
})

document.getElementById('btnCancelWorkout').addEventListener('click', () => {
    Swal.fire({
        title: 'Cancel Workout?', text: 'Progress will be lost.',
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'Cancel Workout', confirmButtonColor: 'var(--red)',
        cancelButtonText: 'Keep Going'
    }).then(r => {
        if (r.isConfirmed) {
            clearInterval(intWorkoutInterval)
            stopRestTimer()
            objActive = null
            showPage('pageWorkouts')
        }
    })
})

function finishWorkout() {
    clearInterval(intWorkoutInterval)
    stopRestTimer()

    const intDuration = Math.floor((Date.now() - new Date(objActive.startTime)) / 1000)
    const exercises   = objActive.exercises.map(ex => ({
        name: ex.name,
        sets: ex.sets.filter(s => s.done).map(s => ({ weight: s.actualWeight, reps: s.actualReps }))
    })).filter(ex => ex.sets.length > 0)

    if (!exercises.length) {
        Swal.fire({ icon:'info', title:'No sets logged', text:'Complete at least one set before finishing.', confirmButtonColor:'var(--accent)' })
        return
    }

    const session = {
        id: uid(),
        name:     objActive.name,
        date:     new Date().toISOString(),
        duration: intDuration,
        exercises
    }

    arrHistory.unshift(session)
    save('gt_history', arrHistory)

    const intVol = exercises.reduce((t, ex) =>
        t + ex.sets.reduce((acc, set) => acc + set.weight * set.reps, 0), 0)

    objActive = null
    Swal.fire({
        icon: 'success', title: 'Workout Complete! 💪',
        html: `<b>${fmtTime(intDuration)}</b> · <b>${formatVolume(intVol)} lb</b> total volume`,
        confirmButtonColor: 'var(--accent)',
        background: 'var(--surface)', color: 'var(--text)'
    }).then(() => showPage('pageHistory'))
}

// ══════════════════════════════════════════════════════════
//  History Page
// ══════════════════════════════════════════════════════════
function renderHistoryPage() {
    const div  = document.getElementById('divHistoryList')
    const none = document.getElementById('divNoHistory')
    if (!arrHistory.length) { div.innerHTML = ''; none.classList.remove('d-none'); return }
    none.classList.add('d-none')

    div.innerHTML = arrHistory.map((s, i) => {
        const intVol  = s.exercises.reduce((t, ex) => t + ex.sets.reduce((acc, set) => acc + set.weight * set.reps, 0), 0)
        const intSets = s.exercises.reduce((t, ex) => t + ex.sets.length, 0)
        const strExs  = s.exercises.map(e => `<span class="history-exercise-tag">${escHtml(e.name)}</span>`).join('')
        return `
        <div class="history-card" onclick="openHistoryDetail(${i})" style="cursor:pointer">
            <div class="history-card-header">
                <div class="history-card-name">${escHtml(s.name)}</div>
                <div class="history-card-date">${fmtDate(s.date)}</div>
            </div>
            <div class="history-card-stats">
                <div class="history-stat-item"><strong>${fmtTime(s.duration||0)}</strong>Duration</div>
                <div class="history-stat-item"><strong>${intSets}</strong>Sets</div>
                <div class="history-stat-item"><strong>${formatVolume(intVol)} lb</strong>Volume</div>
            </div>
            <div>${strExs}</div>
        </div>`
    }).join('')
}

function openHistoryDetail(i) {
    const s = arrHistory[i]
    let html = `<div style="text-align:left;max-height:60vh;overflow:auto">`
    html += `<div style="color:var(--text2);font-size:0.8rem;margin-bottom:12px">${fmtDate(s.date)} - ${fmtTime(s.duration||0)}</div>`
    for (const ex of s.exercises) {
        html += `<div style="font-weight:700;margin-bottom:4px">${escHtml(ex.name)}</div>`
        html += ex.sets.map((set, idx) =>
            `<div style="font-size:0.85rem;color:var(--text2);padding-left:8px">Set ${idx+1}: ${set.weight>0?set.weight+' lb':'BW'} x ${set.reps} reps (est 1RM: ${calc1RM(set.weight,set.reps)} lb)</div>`
        ).join('')
        html += `<br>`
    }
    html += '</div>'
    Swal.fire({
        title: escHtml(s.name), html,
        confirmButtonText: 'Close', confirmButtonColor: 'var(--accent)',
        background: 'var(--surface)', color: 'var(--text)'
    })
}

// ══════════════════════════════════════════════════════════
//  Exercise Library Page
// ══════════════════════════════════════════════════════════
function renderExerciseLibrary(strQuery) {
    const q    = (strQuery !== undefined ? strQuery : document.getElementById('txtExerciseSearch').value).toLowerCase().trim()
    const div  = document.getElementById('divExerciseLibrary')
    const none = document.getElementById('divNoLoggedExercises')
    const arrNames = [...new Set(arrHistory.flatMap(s => s.exercises.map(e => e.name)))].sort()
    const filtered = q ? arrNames.filter(n => n.toLowerCase().includes(q)) : arrNames

    if (!filtered.length) { div.innerHTML = ''; none.classList.remove('d-none'); return }
    none.classList.add('d-none')

    div.innerHTML = filtered.map(name => {
        const best  = getBestSet(name)
        const strPR = best ? `PR: ${best.weight>0?best.weight+' lb':'BW'} x ${best.reps} - Est 1RM ${best.oneRM} lb` : 'No data yet'
        return `
        <div class="exercise-lib-row" onclick="openExerciseDetail('${escHtml(name)}')">
            <div>
                <div class="exercise-lib-name">${escHtml(name)}</div>
                <div class="exercise-lib-pr">${strPR}</div>
            </div>
            <i class="bi bi-chevron-right" style="color:var(--text3)"></i>
        </div>`
    }).join('')
}

document.getElementById('txtExerciseSearch').addEventListener('input', e => renderExerciseLibrary(e.target.value))

// ══════════════════════════════════════════════════════════
//  Exercise Detail + Charts
// ══════════════════════════════════════════════════════════
function openExerciseDetail(strName) {
    strDetailExercise  = strName
    strDetailChartType = 'oneRM'
    document.getElementById('headingExerciseDetail').textContent = strName
    document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.chart === 'oneRM')
    })
    renderExerciseStats(strName)
    renderExerciseHistoryList(strName)
    renderExerciseChart(strName, 'oneRM')
    showPage('pageExerciseDetail')
}

function getExerciseSessions(strName) {
    return arrHistory
        .filter(s => s.exercises.some(e => e.name === strName))
        .map(s => { const ex = s.exercises.find(e => e.name === strName); return { date: s.date, sets: ex.sets } })
        .reverse()
}

function renderExerciseStats(strName) {
    const best        = getBestSet(strName)
    const arrSess     = getExerciseSessions(strName)
    const intTotalSets = arrSess.reduce((t, s) => t + s.sets.length, 0)

    document.getElementById('divExerciseStats').innerHTML = `
        <div class="stat-pill">
            <div class="stat-pill-value">${best ? best.weight+' lb' : '—'}</div>
            <div class="stat-pill-label">Best Weight</div>
        </div>
        <div class="stat-pill">
            <div class="stat-pill-value">${best ? best.oneRM+' lb' : '—'}</div>
            <div class="stat-pill-label">Est. 1RM</div>
        </div>
        <div class="stat-pill">
            <div class="stat-pill-value">${arrSess.length}</div>
            <div class="stat-pill-label">Sessions</div>
        </div>
        <div class="stat-pill">
            <div class="stat-pill-value">${intTotalSets}</div>
            <div class="stat-pill-label">Total Sets</div>
        </div>`
}

function renderExerciseChart(strName, strType) {
    const arrSess = getExerciseSessions(strName)
    if (objDetailChart) { objDetailChart.destroy(); objDetailChart = null }
    const labels = arrSess.map(s => fmtShortDate(s.date))
    let data, strLabel, strColor
    if (strType === 'oneRM') {
        data = arrSess.map(s => Math.max(0, ...s.sets.map(set => calc1RM(set.weight, set.reps))))
        strLabel = 'Est. 1RM (lb)'; strColor = '#ff6b2b'
    } else if (strType === 'volume') {
        data = arrSess.map(s => s.sets.reduce((t, set) => t + set.weight * set.reps, 0))
        strLabel = 'Volume (lb)'; strColor = '#30d158'
    } else {
        data = arrSess.map(s => Math.max(0, ...s.sets.map(set => set.weight)))
        strLabel = 'Max Weight (lb)'; strColor = '#64d2ff'
    }
    const ctx = document.getElementById('canvasExerciseChart').getContext('2d')
    objDetailChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: strLabel, data, borderColor: strColor, backgroundColor: strColor+'22', pointBackgroundColor: strColor, pointRadius: 4, tension: 0.3, fill: true }] },
        options: chartDefaults(strLabel)
    })
}

function renderExerciseHistoryList(strName) {
    const arrSess = getExerciseSessions(strName).slice().reverse()
    const div = document.getElementById('divExerciseHistory')
    if (!arrSess.length) { div.innerHTML = '<div class="text-muted small">No history.</div>'; return }
    div.innerHTML = arrSess.map(s => {
        const strSets = s.sets.map((set, idx) => `Set ${idx+1}: ${set.weight>0?set.weight+' lb':'BW'} x ${set.reps}`).join(' · ')
        return `<div class="exercise-history-entry"><div class="exercise-history-entry-date">${fmtDate(s.date)}</div><div class="exercise-history-entry-sets">${escHtml(strSets)}</div></div>`
    }).join('')
}

document.getElementById('divChartToggle').addEventListener('click', e => {
    const btn = e.target.closest('.chart-toggle-btn')
    if (!btn) return
    document.querySelectorAll('.chart-toggle-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    strDetailChartType = btn.dataset.chart
    renderExerciseChart(strDetailExercise, strDetailChartType)
})

document.getElementById('btnBackFromExercise').addEventListener('click', () => showPage('pageExercises'))

// ══════════════════════════════════════════════════════════
//  Analytics Page
// ══════════════════════════════════════════════════════════
function renderAnalyticsPage() {
    renderSummaryStats()
    renderVolumeChart()
    renderFreqChart()
    renderPRBoard()
}

function renderSummaryStats() {
    const intTotal  = arrHistory.length
    const intVolume = arrHistory.reduce((t, s) =>
        t + s.exercises.reduce((v, ex) => v + ex.sets.reduce((acc, set) => acc + set.weight * set.reps, 0), 0), 0)
    const intTime   = arrHistory.reduce((t, s) => t + (s.duration||0), 0)
    const intStreak = calcStreak()
    document.getElementById('statTotalWorkouts').innerHTML = `<div class="stat-card-value">${intTotal}</div><div class="stat-card-label">Workouts</div>`
    document.getElementById('statTotalVolume').innerHTML   = `<div class="stat-card-value">${formatVolume(intVolume)}</div><div class="stat-card-label">Total Volume (lb)</div>`
    document.getElementById('statStreak').innerHTML        = `<div class="stat-card-value">${intStreak}</div><div class="stat-card-label">Day Streak 🔥</div>`
    document.getElementById('statTotalTime').innerHTML     = `<div class="stat-card-value">${Math.round(intTime/3600)}h</div><div class="stat-card-label">Total Time</div>`
}

function calcStreak() {
    if (!arrHistory.length) return 0
    const dates = [...new Set(arrHistory.map(s => new Date(s.date).toDateString()))].map(d => new Date(d))
    dates.sort((a, b) => b - a)
    const today = new Date(); today.setHours(0,0,0,0)
    const first = new Date(dates[0]); first.setHours(0,0,0,0)
    if (Math.round((today - first) / 86400000) > 1) return 0
    let streak = 1
    for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i-1]); prev.setHours(0,0,0,0)
        const curr = new Date(dates[i]);   curr.setHours(0,0,0,0)
        if (Math.round((prev - curr) / 86400000) === 1) streak++
        else break
    }
    return streak
}

function getWeeklyData(intWeeks) {
    const now = new Date()
    const labels = [], volumes = [], counts = []
    for (let wk = intWeeks - 1; wk >= 0; wk--) {
        const wStart = new Date(now)
        wStart.setDate(now.getDate() - wk*7 - now.getDay())
        wStart.setHours(0,0,0,0)
        const wEnd = new Date(wStart)
        wEnd.setDate(wStart.getDate() + 6)
        wEnd.setHours(23,59,59,999)
        const sessions = arrHistory.filter(s => { const d = new Date(s.date); return d >= wStart && d <= wEnd })
        const vol = sessions.reduce((t, s) =>
            t + s.exercises.reduce((v, ex) => v + ex.sets.reduce((acc, set) => acc + set.weight * set.reps, 0), 0), 0)
        labels.push(wStart.toLocaleDateString('en-US', { month:'short', day:'numeric' }))
        volumes.push(vol)
        counts.push(sessions.length)
    }
    return { labels, volumes, counts }
}

function renderVolumeChart() {
    if (objVolumeChart) { objVolumeChart.destroy(); objVolumeChart = null }
    const { labels, volumes } = getWeeklyData(12)
    const ctx = document.getElementById('canvasVolumeChart').getContext('2d')
    objVolumeChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Volume (lb)', data: volumes, backgroundColor: '#ff6b2b88', borderColor: '#ff6b2b', borderWidth: 1, borderRadius: 4 }] },
        options: chartDefaults('Volume (lb)')
    })
}

function renderFreqChart() {
    if (objFreqChart) { objFreqChart.destroy(); objFreqChart = null }
    const { labels, counts } = getWeeklyData(12)
    const ctx = document.getElementById('canvasFreqChart').getContext('2d')
    objFreqChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Workouts', data: counts, backgroundColor: '#30d15888', borderColor: '#30d158', borderWidth: 1, borderRadius: 4 }] },
        options: chartDefaults('Workouts')
    })
}

function renderPRBoard() {
    const div   = document.getElementById('divPRBoard')
    const none  = document.getElementById('divNoPRs')
    const names = [...new Set(arrHistory.flatMap(s => s.exercises.map(e => e.name)))].sort()
    if (!names.length) { div.innerHTML = ''; none.classList.remove('d-none'); return }
    none.classList.add('d-none')
    div.innerHTML = names.map(name => {
        const best = getBestSet(name)
        if (!best) return ''
        return `<div class="pr-board-row" onclick="openExerciseDetail('${escHtml(name)}')" style="cursor:pointer">
            <div><div class="pr-board-name">${escHtml(name)}</div><div style="font-size:0.75rem;color:var(--text2)">${best.weight>0?best.weight+' lb':'BW'} x ${best.reps} reps</div></div>
            <div class="text-end"><div class="pr-board-value">${best.oneRM} lb</div><div class="pr-board-1rm">Est. 1RM</div></div>
        </div>`
    }).join('')
}

// ══════════════════════════════════════════════════════════
//  Chart.js dark defaults
// ══════════════════════════════════════════════════════════
function chartDefaults(strLabel) {
    return {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#2c2c2e', titleColor: '#fff', bodyColor: '#8e8e93', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }
        },
        scales: {
            x: { ticks: { color: '#636366', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: '#636366', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true }
        }
    }
}

// ══════════════════════════════════════════════════════════
//  PR helpers (referenced before definition — moved here)
// ══════════════════════════════════════════════════════════
function getBestSet(strExName) {
    let best = null
    for (const session of arrHistory) {
        for (const ex of session.exercises) {
            if (ex.name !== strExName) continue
            for (const s of ex.sets) {
                const est = calc1RM(s.weight, s.reps)
                if (!best || est > best.oneRM) best = { weight: s.weight, reps: s.reps, oneRM: est }
            }
        }
    }
    return best
}

function isNewPR(strExName, weight, reps) {
    const best = getBestSet(strExName)
    if (!best) return false
    return calc1RM(weight, reps) > best.oneRM
}

function getPrevPerformance(strExName) {
    for (const session of arrHistory) {
        const ex = session.exercises.find(e => e.name === strExName)
        if (ex && ex.sets.length) return ex.sets
    }
    return null
}

// ══════════════════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════════════════
showPage('pageWorkouts')
