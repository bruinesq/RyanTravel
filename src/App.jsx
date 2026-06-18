import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase.js'
import jsPDF from 'jspdf'

// ───────────────────────────────────────────────────────────────
// CONSTANTS
// ───────────────────────────────────────────────────────────────
const CATEGORIES = ['Meals', 'Flight', 'Gas', 'Lodging', 'Activities', 'Other']
const CAT_CLASS = {
  Meals: 'cat-meals',
  Flight: 'cat-flight',
  Gas: 'cat-gas',
  Lodging: 'cat-lodging',
  Activities: 'cat-activities',
  Other: 'cat-other',
}

function fmtMoney(n) {
  return '$' + Number(n || 0).toFixed(2)
}
function fmtDate(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${m}/${d}/${y}`
}
function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// ───────────────────────────────────────────────────────────────
// CALCULATOR MODAL
// ───────────────────────────────────────────────────────────────
function CalcModal({ initial, onConfirm, onClose }) {
  const [display, setDisplay] = useState(initial || '0')
  const [expr, setExpr] = useState(initial || '')
  const [fresh, setFresh] = useState(!initial)

  function press(val) {
    if (val === 'C') { setDisplay('0'); setExpr(''); setFresh(true); return }
    if (val === '⌫') {
      const s = display.length <= 1 ? '0' : display.slice(0, -1)
      setDisplay(s); setExpr(s); setFresh(false); return
    }
    if (val === '=') {
      try {
        const result = Function('"use strict"; return (' + expr + ')')()
        const r = parseFloat(result.toFixed(2)).toString()
        setDisplay(r); setExpr(r); setFresh(true)
      } catch { setDisplay('ERR') }
      return
    }
    const isOp = ['+', '-', '×', '÷', '.'].includes(val)
    const actualVal = val === '×' ? '*' : val === '÷' ? '/' : val
    if (fresh && !isOp) {
      setDisplay(val); setExpr(actualVal); setFresh(false)
    } else {
      const next = (expr === '0' && !isOp) ? actualVal : expr + actualVal
      setDisplay(next.replace('*', '×').replace('/', '÷'))
      setExpr(next)
      setFresh(false)
    }
  }

  const keys = [
    ['7','8','9','÷'],
    ['4','5','6','×'],
    ['1','2','3','-'],
    ['C','0','.','='],
    ['⌫','+'],
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">Enter Amount</div>
        <div className="calc-display">{display}</div>
        <div className="calc-grid">
          {keys.flat().map((k, i) => {
            let cls = 'calc-btn'
            if (['+','-','×','÷'].includes(k)) cls += ' op'
            if (k === '=') cls += ' equals'
            if (k === 'C') cls += ' clear'
            return (
              <button
                key={i}
                className={cls}
                onClick={() => press(k)}
                style={k === '0' || k === '⌫' || k === '+' ? {} : {}}
              >
                {k}
              </button>
            )
          })}
        </div>
        <button
          className="calc-confirm"
          onClick={() => {
            let val = display
            if (val === 'ERR' || val === '') val = '0'
            onConfirm(parseFloat(val) || 0)
          }}
        >
          Use {display === 'ERR' ? '0' : display}
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// DATE PICKER MODAL
// ───────────────────────────────────────────────────────────────
function DateModal({ initial, onConfirm, onClose }) {
  const [val, setVal] = useState(initial || todayStr())
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">Select Date</div>
        <input
          type="date"
          className="date-input-large"
          value={val}
          onChange={e => setVal(e.target.value)}
          max={todayStr()}
        />
        <button className="date-confirm" onClick={() => onConfirm(val)}>
          Confirm Date
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// PARTICIPANTS MODAL
// ───────────────────────────────────────────────────────────────
function ParticipantsModal({ members, selected, onConfirm, onClose }) {
  const [checked, setChecked] = useState(new Set(selected))

  function toggle(name) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">Select Participants</div>
        <div className="participant-check-list">
          {members.map(m => (
            <div
              key={m}
              className={`participant-check-item${checked.has(m) ? ' checked' : ''}`}
              onClick={() => toggle(m)}
            >
              <div className="check-icon">
                {checked.has(m) && <span>✓</span>}
              </div>
              <span className="participant-name">{m}</span>
            </div>
          ))}
        </div>
        <button
          className="participants-done-btn"
          onClick={() => onConfirm(Array.from(checked))}
        >
          Done ({checked.size} selected)
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// TRIP FORM MODAL
// ───────────────────────────────────────────────────────────────
function TripFormModal({ onSave, onClose }) {
  const [tripName, setTripName] = useState('')
  const [members, setMembers] = useState(['', ''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addMember() { setMembers(prev => [...prev, '']) }
  function removeMember(i) { setMembers(prev => prev.filter((_, j) => j !== i)) }
  function setMember(i, val) {
    setMembers(prev => prev.map((m, j) => j === i ? val : m))
  }

  async function save() {
    const name = tripName.trim()
    if (!name) { setError('Trip name is required.'); return }
    const clean = members.map(m => m.trim()).filter(Boolean)
    if (clean.length < 1) { setError('Add at least one member.'); return }
    setSaving(true)
    try {
      const { data: trip, error: te } = await supabase
        .from('trips')
        .insert({ name })
        .select()
        .single()
      if (te) throw te
      const memberRows = clean.map(m_name => ({ trip_id: trip.id, name: m_name }))
      const { error: me } = await supabase.from('trip_members').insert(memberRows)
      if (me) throw me
      onSave(trip.id)
    } catch (e) {
      setError(e.message || 'Failed to create trip.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">New Trip</div>
        {error && <div className="error-banner">{error}</div>}
        <div className="trip-form-field">
          <label>Trip Name</label>
          <input
            type="text"
            placeholder="e.g. Hawaii 2026"
            value={tripName}
            onChange={e => setTripName(e.target.value)}
          />
        </div>
        <div className="trip-form-field">
          <label>Members</label>
          {members.map((m, i) => (
            <div key={i} className="member-input-row">
              <input
                type="text"
                placeholder={`Member ${i + 1}`}
                value={m}
                onChange={e => setMember(i, e.target.value)}
              />
              {members.length > 1 && (
                <button className="remove-member-btn" onClick={() => removeMember(i)}>✕</button>
              )}
            </div>
          ))}
          <button className="add-member-btn" onClick={addMember}>+ Add Member</button>
        </div>
        <button className="save-trip-btn" onClick={save} disabled={saving}>
          {saving ? 'Creating...' : 'Create Trip'}
        </button>
        <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// EDIT MEMBERS MODAL
// ───────────────────────────────────────────────────────────────
function EditMembersModal({ tripId, members, onSave, onClose }) {
  const [names, setNames] = useState(members.map(m => m.name))
  const [ids, setIds] = useState(members.map(m => m.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addMember() { setNames(prev => [...prev, '']); setIds(prev => [...prev, null]) }
  function removeMember(i) {
    setNames(prev => prev.filter((_, j) => j !== i))
    setIds(prev => prev.filter((_, j) => j !== i))
  }
  function setName(i, val) { setNames(prev => prev.map((n, j) => j === i ? val : n)) }

  async function save() {
    const clean = names.map(n => n.trim()).filter(Boolean)
    if (clean.length < 1) { setError('At least one member required.'); return }
    setSaving(true)
    try {
      // Delete all existing members for this trip, then re-insert
      await supabase.from('trip_members').delete().eq('trip_id', tripId)
      const rows = clean.map(n => ({ trip_id: tripId, name: n }))
      const { error: e } = await supabase.from('trip_members').insert(rows)
      if (e) throw e
      onSave()
    } catch (e) {
      setError(e.message || 'Failed to save members.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">Edit Members</div>
        {error && <div className="error-banner">{error}</div>}
        {names.map((n, i) => (
          <div key={i} className="member-input-row">
            <input
              type="text"
              placeholder={`Member ${i + 1}`}
              value={n}
              onChange={e => setName(i, e.target.value)}
            />
            {names.length > 1 && (
              <button className="remove-member-btn" onClick={() => removeMember(i)}>✕</button>
            )}
          </div>
        ))}
        <button className="add-member-btn" onClick={addMember}>+ Add Member</button>
        <button className="save-trip-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Members'}
        </button>
        <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// EXPENSE FORM SCREEN
// ───────────────────────────────────────────────────────────────
function ExpenseFormScreen({ trip, members, expense, onSave, onCancel }) {
  const [date, setDate] = useState(expense?.expense_date || todayStr())
  const [amount, setAmount] = useState(expense?.amount?.toString() || '')
  const [description, setDescription] = useState(expense?.description || '')
  const [category, setCategory] = useState(expense?.category || 'Meals')
  const [paidBy, setPaidBy] = useState(expense?.paid_by || (members[0]?.name || ''))
  const [participants, setParticipants] = useState(
    expense?.expense_participants?.map(p => p.member_name) ||
    members.map(m => m.name)
  )
  const [showCalc, setShowCalc] = useState(false)
  const [showDate, setShowDate] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!amount || parseFloat(amount) <= 0) { setError('Amount must be greater than 0.'); return }
    if (!description.trim()) { setError('Description is required.'); return }
    if (!paidBy) { setError('Select who paid.'); return }
    if (participants.length === 0) { setError('Select at least one participant.'); return }
    setSaving(true)
    try {
      let expenseId = expense?.id
      if (expenseId) {
        // Update existing
        const { error: ue } = await supabase
          .from('expenses')
          .update({
            expense_date: date,
            amount: parseFloat(amount),
            description: description.trim(),
            category,
            paid_by: paidBy,
          })
          .eq('id', expenseId)
        if (ue) throw ue
        // Delete existing participants and re-insert
        await supabase.from('expense_participants').delete().eq('expense_id', expenseId)
      } else {
        // Insert new
        const { data: newExp, error: ie } = await supabase
          .from('expenses')
          .insert({
            trip_id: trip.id,
            expense_date: date,
            amount: parseFloat(amount),
            description: description.trim(),
            category,
            paid_by: paidBy,
          })
          .select()
          .single()
        if (ie) throw ie
        expenseId = newExp.id
      }
      const pRows = participants.map(m_name => ({ expense_id: expenseId, member_name: m_name }))
      if (pRows.length > 0) {
        const { error: pe } = await supabase.from('expense_participants').insert(pRows)
        if (pe) throw pe
      }
      onSave()
    } catch (e) {
      setError(e.message || 'Failed to save expense.')
      setSaving(false)
    }
  }

  return (
    <div className="screen-content">
      <div className="form-screen">
        <h2>{expense ? 'Edit Expense' : 'New Expense'}</h2>
        {error && <div className="error-banner">{error}</div>}

        {/* Row 1: Date | Amount */}
        <div className="form-row">
          <div className="form-field">
            <label>Date</label>
            <div
              className="tappable-field"
              onClick={() => setShowDate(true)}
            >
              <span>{fmtDate(date)}</span>
              <span className="tappable-icon">📅</span>
            </div>
          </div>
          <div className="form-field">
            <label>Amount</label>
            <div
              className={`tappable-field${!amount ? ' placeholder' : ''}`}
              onClick={() => setShowCalc(true)}
            >
              <span>{amount ? fmtMoney(amount) : '$0.00'}</span>
              <span className="tappable-icon">🧮</span>
            </div>
          </div>
        </div>

        {/* Row 2: Description (full width) */}
        <div className="form-field-full">
          <div className="form-field">
            <label>Description</label>
            <input
              type="text"
              placeholder="What was purchased?"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </div>

        {/* Row 3: Category | Paid By */}
        <div className="form-row">
          <div className="form-field">
            <label>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Paid By</label>
            <select value={paidBy} onChange={e => setPaidBy(e.target.value)}>
              {members.map(m => <option key={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        {/* Row 4: Participants (full width) */}
        <button
          className="participants-btn"
          onClick={() => setShowParticipants(true)}
        >
          <span>
            Participants:{' '}
            {participants.length === 0
              ? 'None selected'
              : participants.length === members.length
              ? 'All members'
              : participants.join(', ')}
          </span>
          <span>›</span>
        </button>

        <div className="form-actions">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : expense ? 'Update' : 'Add Expense'}
          </button>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>

      {showCalc && (
        <CalcModal
          initial={amount}
          onConfirm={v => { setAmount(v.toString()); setShowCalc(false) }}
          onClose={() => setShowCalc(false)}
        />
      )}
      {showDate && (
        <DateModal
          initial={date}
          onConfirm={v => { setDate(v); setShowDate(false) }}
          onClose={() => setShowDate(false)}
        />
      )}
      {showParticipants && (
        <ParticipantsModal
          members={members.map(m => m.name)}
          selected={participants}
          onConfirm={v => { setParticipants(v); setShowParticipants(false) }}
          onClose={() => setShowParticipants(false)}
        />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// EXPENSES LIST SCREEN
// ───────────────────────────────────────────────────────────────
function ExpensesScreen({ expenses, onEdit, onDelete }) {
  const [sortField, setSortField] = useState('most_recent')
  const [sortDir, setSortDir] = useState('desc')

  function cycleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const sorted = [...expenses].sort((a, b) => {
    let cmp = 0
    if (sortField === 'most_recent' || sortField === 'by_date') {
      cmp = a.expense_date < b.expense_date ? -1 : a.expense_date > b.expense_date ? 1 : 0
    } else if (sortField === 'by_payor') {
      cmp = (a.paid_by || '').localeCompare(b.paid_by || '')
    }
    if (sortField === 'most_recent') cmp = -cmp // newest first by default
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className="screen-content">
      <div className="expenses-screen">
        <div className="sort-bar">
          <div className="sort-chevrons">
            <button
              className={sortDir === 'asc' ? 'active' : ''}
              onClick={() => setSortDir('asc')}
            >▲</button>
            <button
              className={sortDir === 'desc' ? 'active' : ''}
              onClick={() => setSortDir('desc')}
            >▼</button>
          </div>
          <div className="sort-options">
            {[
              { key: 'most_recent', label: 'Most Recent' },
              { key: 'by_date', label: 'By Date' },
              { key: 'by_payor', label: 'By Payor' },
            ].map(opt => (
              <button
                key={opt.key}
                className={`sort-option-btn${sortField === opt.key ? ' active' : ''}`}
                onClick={() => cycleSort(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="no-expenses">
            <p>No expenses yet.</p>
            <p>Go to Home and tap "+ Enter Expense".</p>
          </div>
        ) : (
          <div className="expense-list">
            {sorted.map(exp => (
              <div
                key={exp.id}
                className={`expense-item ${CAT_CLASS[exp.category] || 'cat-other'}`}
              >
                <div className="expense-info">
                  <div className="expense-top">
                    <span className="expense-category">{exp.category}</span>
                    <span>•</span>
                    <span className="expense-desc">{exp.description}</span>
                  </div>
                  <div className="expense-meta">
                    {fmtDate(exp.expense_date)} · Paid by {exp.paid_by}
                    {exp.expense_participants?.length > 0 && (
                      <span> · {exp.expense_participants.map(p => p.member_name).join(', ')}</span>
                    )}
                  </div>
                </div>
                <div className="expense-amount">{fmtMoney(exp.amount)}</div>
                <div className="expense-actions">
                  <button onClick={() => onEdit(exp)} title="Edit">✎</button>
                  <button className="delete-btn" onClick={() => onDelete(exp.id)} title="Delete">🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// SUMMARY SCREEN
// ───────────────────────────────────────────────────────────────
function SummaryScreen({ trip, expenses, members }) {
  const [view, setView] = useState('category')

  const total = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)

  // By Category
  const byCategory = CATEGORIES.reduce((acc, cat) => {
    const sum = expenses
      .filter(e => e.category === cat)
      .reduce((s, e) => s + parseFloat(e.amount || 0), 0)
    if (sum > 0) acc[cat] = sum
    return acc
  }, {})

  // Per Person (split expenses among participants)
  const perPerson = {}
  members.forEach(m => { perPerson[m.name] = 0 })
  expenses.forEach(exp => {
    const parts = exp.expense_participants?.map(p => p.member_name) || []
    if (parts.length === 0) return
    const share = parseFloat(exp.amount || 0) / parts.length
    parts.forEach(name => {
      if (perPerson[name] !== undefined) perPerson[name] += share
    })
  })

  // Settlement (who owes whom)
  const paid = {}
  members.forEach(m => { paid[m.name] = 0 })
  expenses.forEach(exp => {
    if (paid[exp.paid_by] !== undefined) paid[exp.paid_by] += parseFloat(exp.amount || 0)
  })
  const balance = {}
  members.forEach(m => { balance[m.name] = (paid[m.name] || 0) - (perPerson[m.name] || 0) })

  const creditors = Object.entries(balance).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const debtors = Object.entries(balance).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1])
  const settlements = []
  const cArr = creditors.map(([n, v]) => ({ n, v }))
  const dArr = debtors.map(([n, v]) => ({ n, v: -v }))
  let ci = 0, di = 0
  while (ci < cArr.length && di < dArr.length) {
    const amt = Math.min(cArr[ci].v, dArr[di].v)
    if (amt > 0.01) settlements.push({ from: dArr[di].n, to: cArr[ci].n, amount: amt })
    cArr[ci].v -= amt
    dArr[di].v -= amt
    if (cArr[ci].v < 0.01) ci++
    if (dArr[di].v < 0.01) di++
  }

  function exportPDF() {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    let y = 40
    const lm = 40
    const pw = 532

    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text(trip.name + ' — Trip Summary', lm, y)
    y += 30

    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text('Generated: ' + new Date().toLocaleDateString(), lm, y)
    y += 20

    // Total
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Total Trip Cost: ' + fmtMoney(total), lm, y)
    y += 30

    // By Category
    doc.setFontSize(13)
    doc.text('By Category', lm, y)
    y += 6
    doc.setDrawColor(180, 180, 180)
    doc.line(lm, y, lm + pw, y)
    y += 14
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    Object.entries(byCategory).forEach(([cat, amt]) => {
      doc.text(cat, lm, y)
      doc.text(fmtMoney(amt), lm + pw, y, { align: 'right' })
      y += 16
    })
    y += 10

    // Per Person
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Per Person (Share)', lm, y)
    y += 6
    doc.line(lm, y, lm + pw, y)
    y += 14
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    Object.entries(perPerson).forEach(([name, amt]) => {
      doc.text(name, lm, y)
      doc.text(fmtMoney(amt), lm + pw, y, { align: 'right' })
      y += 16
    })
    y += 10

    // Settlement
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Settlement', lm, y)
    y += 6
    doc.line(lm, y, lm + pw, y)
    y += 14
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    if (settlements.length === 0) {
      doc.text('No settlements needed.', lm, y)
      y += 16
    } else {
      settlements.forEach(s => {
        doc.text(`${s.from} → ${s.to}`, lm, y)
        doc.text(fmtMoney(s.amount), lm + pw, y, { align: 'right' })
        y += 16
      })
    }
    y += 10

    // All Expenses
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('All Expenses', lm, y)
    y += 6
    doc.line(lm, y, lm + pw, y)
    y += 14
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const sorted = [...expenses].sort((a, b) => a.expense_date < b.expense_date ? -1 : 1)
    sorted.forEach(exp => {
      if (y > 720) { doc.addPage(); y = 40 }
      const line = `${fmtDate(exp.expense_date)} · ${exp.category} · ${exp.description} · Paid by ${exp.paid_by}`
      doc.text(line, lm, y, { maxWidth: pw - 80 })
      doc.text(fmtMoney(exp.amount), lm + pw, y, { align: 'right' })
      y += 16
    })

    doc.save(trip.name.replace(/\s+/g, '_') + '_summary.pdf')
  }

  return (
    <div className="screen-content">
      <div className="summary-screen">
        <div className="summary-header">
          <h2>Summary</h2>
          <button className="pdf-export-btn" onClick={exportPDF}>Export PDF</button>
        </div>

        <div className="total-cost-display">
          <div className="total-label">Total Trip Cost</div>
          <div className="total-amount">{fmtMoney(total)}</div>
        </div>

        <div className="toggle-btns">
          <button
            className={`toggle-btn${view === 'category' ? ' active' : ''}`}
            onClick={() => setView('category')}
          >By Category</button>
          <button
            className={`toggle-btn${view === 'person' ? ' active' : ''}`}
            onClick={() => setView('person')}
          >Per Person</button>
          <button
            className={`toggle-btn${view === 'settlement' ? ' active' : ''}`}
            onClick={() => setView('settlement')}
          >Settlement</button>
        </div>

        {view === 'category' && (
          <div className="summary-section">
            <h3>By Category</h3>
            {Object.keys(byCategory).length === 0 ? (
              <div className="summary-row"><span className="row-label">No expenses yet.</span></div>
            ) : Object.entries(byCategory).map(([cat, amt]) => (
              <div key={cat} className="summary-row">
                <span className="row-label">{cat}</span>
                <span className="row-value">{fmtMoney(amt)}</span>
              </div>
            ))}
          </div>
        )}

        {view === 'person' && (
          <div className="summary-section">
            <h3>Per Person (Share)</h3>
            {Object.entries(perPerson).map(([name, amt]) => (
              <div key={name} className="summary-row">
                <span className="row-label">{name}</span>
                <span className="row-value">{fmtMoney(amt)}</span>
              </div>
            ))}
          </div>
        )}

        {view === 'settlement' && (
          <div className="summary-section">
            <h3>Settlement</h3>
            {settlements.length === 0 ? (
              <div className="summary-row">
                <span className="row-label">Everyone is settled up! ✓</span>
              </div>
            ) : settlements.map((s, i) => (
              <div key={i} className="summary-row">
                <span className="row-label">{s.from} → {s.to}</span>
                <span className="row-value positive">{fmtMoney(s.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// HOME SCREEN
// ───────────────────────────────────────────────────────────────
function HomeScreen({ trips, currentTrip, members, expenses, onSelectTrip, onNewTrip, onEnterExpense, onEditMembers }) {
  return (
    <div className="screen-content">
      <div className="home-screen">
        {trips.length > 1 && (
          <select
            className="past-trips-select"
            value={currentTrip?.id || ''}
            onChange={e => onSelectTrip(e.target.value)}
          >
            {trips.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        {currentTrip ? (
          <div className="trip-card">
            <div className="trip-header">
              <div className="trip-name">{currentTrip.name}</div>
            </div>

            <div className="trip-stats">
              <div className="stat-box">
                <div className="stat-value">{fmtMoney(expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0))}</div>
                <div className="stat-label">Total Spent</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{expenses.length}</div>
                <div className="stat-label">Expenses</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{members.length}</div>
                <div className="stat-label">Members</div>
              </div>
            </div>

            <div className="members-section">
              <div className="members-header">
                <span className="members-title">Members</span>
                <button className="edit-members-btn" onClick={onEditMembers}>✎</button>
              </div>
              <div className="members-grid">
                {members.map(m => (
                  <div key={m.id} className="member-chip">{m.name}</div>
                ))}
              </div>
            </div>

            <button className="enter-expense-btn" onClick={onEnterExpense}>
              + Enter Expense
            </button>
          </div>
        ) : (
          <div className="no-trip-placeholder">
            <p>No trips yet.</p>
            <p>Tap + in the top right to create your first trip.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// MAIN APP
// ───────────────────────────────────────────────────────────────
export default function App() {
  const [trips, setTrips] = useState([])
  const [currentTripId, setCurrentTripId] = useState(null)
  const [members, setMembers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('home')
  const [editingExpense, setEditingExpense] = useState(null)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showNewTrip, setShowNewTrip] = useState(false)
  const [showEditMembers, setShowEditMembers] = useState(false)

  const currentTrip = trips.find(t => t.id === currentTripId) || null

  // ── Load trips ──
  async function loadTrips() {
    const { data } = await supabase
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false })
    if (data && data.length > 0) {
      setTrips(data)
      // Only set currentTripId if not already set to a valid trip
      setCurrentTripId(prev => {
        if (prev && data.find(t => t.id === prev)) return prev
        return data[0].id
      })
    } else {
      setTrips([])
      setCurrentTripId(null)
    }
  }

  // ── Load members for current trip ──
  const loadMembers = useCallback(async (tripId) => {
    if (!tripId) { setMembers([]); return }
    const { data } = await supabase
      .from('trip_members')
      .select('*')
      .eq('trip_id', tripId)
      .order('id')
    setMembers(data || [])
  }, [])

  // ── Load expenses for current trip ──
  const loadExpenses = useCallback(async (tripId) => {
    if (!tripId) { setExpenses([]); return }
    const { data } = await supabase
      .from('expenses')
      .select('*, expense_participants(*)')
      .eq('trip_id', tripId)
      .order('expense_date', { ascending: false })
    setExpenses(data || [])
  }, [])

  // ── Initial load ──
  useEffect(() => {
    loadTrips().finally(() => setLoading(false))
  }, [])

  // ── Reload when trip changes ──
  useEffect(() => {
    if (currentTripId) {
      loadMembers(currentTripId)
      loadExpenses(currentTripId)
    }
  }, [currentTripId, loadMembers, loadExpenses])

  // ── Handlers ──
  function handleSelectTrip(id) {
    setCurrentTripId(id)
    setActiveTab('home')
  }

  function handleNewTripSaved(newId) {
    setShowNewTrip(false)
    setCurrentTripId(newId)
    loadTrips()
    loadMembers(newId)
    loadExpenses(newId)
  }

  async function handleDeleteExpense(id) {
    if (!window.confirm('Delete this expense?')) return
    await supabase.from('expense_participants').delete().eq('expense_id', id)
    await supabase.from('expenses').delete().eq('id', id)
    loadExpenses(currentTripId)
  }

  function handleEditExpense(exp) {
    setEditingExpense(exp)
    setShowExpenseForm(true)
  }

  function handleExpenseSaved() {
    setShowExpenseForm(false)
    setEditingExpense(null)
    loadExpenses(currentTripId)
    setActiveTab('expenses')
  }

  function handleMembersSaved() {
    setShowEditMembers(false)
    loadMembers(currentTripId)
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <span>Loading RyanTravel...</span>
      </div>
    )
  }

  // Determine header title
  const titles = { home: currentTrip?.name || 'RyanTravel', expenses: 'Expenses', summary: 'Summary' }

  return (
    <div className="app-shell">
      {/* Header */}
      <div className="app-header">
        {activeTab === 'home' && trips.length > 1 ? (
          <h1>{currentTrip?.name || 'RyanTravel'}</h1>
        ) : (
          <h1>{titles[activeTab]}</h1>
        )}
        {activeTab === 'home' && (
          <button className="header-btn" onClick={() => setShowNewTrip(true)}>+</button>
        )}
      </div>

      {/* Active Screen */}
      {showExpenseForm ? (
        <ExpenseFormScreen
          trip={currentTrip}
          members={members}
          expense={editingExpense}
          onSave={handleExpenseSaved}
          onCancel={() => { setShowExpenseForm(false); setEditingExpense(null) }}
        />
      ) : activeTab === 'home' ? (
        <HomeScreen
          trips={trips}
          currentTrip={currentTrip}
          members={members}
          expenses={expenses}
          onSelectTrip={handleSelectTrip}
          onNewTrip={() => setShowNewTrip(true)}
          onEnterExpense={() => { setEditingExpense(null); setShowExpenseForm(true) }}
          onEditMembers={() => setShowEditMembers(true)}
        />
      ) : activeTab === 'expenses' ? (
        <ExpensesScreen
          expenses={expenses}
          onEdit={handleEditExpense}
          onDelete={handleDeleteExpense}
        />
      ) : (
        <SummaryScreen
          trip={currentTrip}
          expenses={expenses}
          members={members}
        />
      )}

      {/* Bottom Nav */}
      {!showExpenseForm && (
        <nav className="bottom-nav">
          <button
            className={activeTab === 'home' ? 'active' : ''}
            onClick={() => setActiveTab('home')}
          >
            <span className="nav-icon">🏠</span>
            Home
          </button>
          <button
            className={activeTab === 'expenses' ? 'active' : ''}
            onClick={() => setActiveTab('expenses')}
          >
            <span className="nav-icon">💰</span>
            Expenses
          </button>
          <button
            className={activeTab === 'summary' ? 'active' : ''}
            onClick={() => setActiveTab('summary')}
          >
            <span className="nav-icon">📊</span>
            Summary
          </button>
        </nav>
      )}

      {/* Modals */}
      {showNewTrip && (
        <TripFormModal
          onSave={handleNewTripSaved}
          onClose={() => setShowNewTrip(false)}
        />
      )}
      {showEditMembers && currentTrip && (
        <EditMembersModal
          tripId={currentTripId}
          members={members}
          onSave={handleMembersSaved}
          onClose={() => setShowEditMembers(false)}
        />
      )}
    </div>
  )
}
