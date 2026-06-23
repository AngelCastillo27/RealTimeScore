import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase.js';

const CONTEST_ID = 'concurso-principal';

const CATEGORIES = [
  'Baby',
  'Pre-Infante',
  'Infante',
  'Infantil',
  'Junior',
  'Novel A',
  'Novel B',
  'Juvenil',
  'Adulto',
  'Senior',
  'Oro',
];

const MODALITIES = [
  'Individual',
  'Seriado',
  'Novel Novel',
  'Novel Abierto',
  'Novel A',
  'Novel B',
  'Novel C',
  'Nacional',
  'Reinas',
  'Unidad',
  'Profesores',
];

const STAGES = ['Eliminatoria', 'Semifinal', 'Primera Final', 'Segunda Final', 'Final'];

const emptyParticipant = {
  participant1: '',
  participant2: '',
  category: 'Junior',
  modality: 'Nacional',
  academy: '',
  number: '',
  currentStage: 'Eliminatoria',
  status: 'pendiente',
};

const emptyConfig = {
  category: 'Junior',
  modality: 'Nacional',
  participates: true,
  stages: ['Eliminatoria', 'Final'],
  directFinal: false,
  nextCount: 0,
};

const emptyAssignment = {
  judgeUid: '',
  judgeName: '',
  category: 'Junior',
  modality: 'Nacional',
  stage: 'Eliminatoria',
  active: false,
};

const nowIso = () => new Date().toISOString();

const byName = (a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''));

const participantLabel = (participant) => {
  const names = [participant.participant1, participant.participant2].filter(Boolean).join(' / ');
  return `N ${participant.number || '-'} - ${names || 'Sin nombre'}`;
};

const pathFor = (name) => collection(db, 'concursos', CONTEST_ID, name);

function useLiveCollection(name, sortField = null) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const base = pathFor(name);
    const q = sortField ? query(base, orderBy(sortField)) : base;
    return onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  }, [name, sortField]);

  return items;
}

function useUsers(enabled) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!enabled) {
      setUsers([]);
      return undefined;
    }

    return onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  }, [enabled]);

  return users;
}

function summarize(participants, scores) {
  const scoreKeys = new Set(scores.map((score) => score.participantId));
  const byCategory = {};
  const byModality = {};
  const byPair = {};
  const byStage = {};
  const byAcademy = {};

  participants.forEach((participant) => {
    byCategory[participant.category] = (byCategory[participant.category] || 0) + 1;
    byModality[participant.modality] = (byModality[participant.modality] || 0) + 1;
    byPair[`${participant.category} / ${participant.modality}`] = (byPair[`${participant.category} / ${participant.modality}`] || 0) + 1;
    byStage[participant.currentStage] = (byStage[participant.currentStage] || 0) + 1;
    byAcademy[participant.academy || 'Sin academia'] = (byAcademy[participant.academy || 'Sin academia'] || 0) + 1;
  });

  return {
    byCategory,
    byModality,
    byPair,
    byStage,
    byAcademy,
    scored: participants.filter((participant) => scoreKeys.has(participant.id)).length,
    pending: participants.filter((participant) => !scoreKeys.has(participant.id)).length,
  };
}

function rowsFromPastedTable(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = lines.map((line) => line.split(line.includes('\t') ? '\t' : ',').map((cell) => cell.trim()));
  const first = rows[0] || [];
  const hasHeader = first.some((cell) => /participante|categoria|categor/i.test(cell));
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows.map((row) => ({
    participant1: row[0] || '',
    participant2: row[1] || '',
    category: row[2] || 'Junior',
    modality: row[3] || 'Nacional',
    academy: row[4] || '',
    number: row[5] || '',
    currentStage: 'Eliminatoria',
    status: 'pendiente',
  })).filter((row) => row.participant1 || row.participant2 || row.number);
}

export default function ViewPrincipal({ role, userId, onLogout, loggingOut, sessionMessage }) {
  const [activeView, setActiveView] = useState(role === 'jurado' ? 'scoreNow' : 'summary');
  const [notice, setNotice] = useState('');
  const participants = useLiveCollection('participants', 'number');
  const groups = useLiveCollection('groups', 'order');
  const assignments = useLiveCollection('assignments', 'category');
  const scores = useLiveCollection('scores');
  const configs = useLiveCollection('configs', 'category');
  const users = useUsers(role !== 'jurado');

  const jurors = useMemo(() => users.filter((user) => user.tipoUsuario === 'jurado').sort(byName), [users]);
  const myAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.judgeUid === userId && assignment.active),
    [assignments, userId],
  );
  const totals = useMemo(() => summarize(participants, scores), [participants, scores]);

  useEffect(() => {
    setActiveView(role === 'jurado' ? 'scoreNow' : 'summary');
  }, [role]);

  const addAudit = async (action, detail = {}) => {
    await addDoc(pathFor('audit'), {
      action,
      detail,
      role,
      userId: userId || null,
      createdAt: nowIso(),
    });
  };

  const saveParticipant = async (participant, editId = null) => {
    const duplicates = participants.filter((item) => item.number && item.number === participant.number && item.id !== editId);
    if (duplicates.length) {
      const keep = window.confirm(`El numero ${participant.number} ya existe. Aceptar mantiene el numero; cancelar permite revisarlo.`);
      if (!keep) return false;
    }

    const payload = {
      ...participant,
      updatedAt: nowIso(),
      updatedBy: userId || null,
    };

    if (editId) {
      if (!window.confirm('Confirmar modificacion del participante.')) return false;
      await updateDoc(doc(pathFor('participants'), editId), payload);
      await addAudit('participant.updated', { participantId: editId });
    } else {
      if (!window.confirm('Confirmar creacion del participante.')) return false;
      await addDoc(pathFor('participants'), {
        ...payload,
        createdAt: nowIso(),
        createdBy: userId || null,
      });
      await addAudit('participant.created', { number: participant.number });
    }

    setNotice('Participante guardado.');
    return true;
  };

  const deleteParticipant = async (participantId) => {
    if (!window.confirm('Confirmar eliminacion del participante.')) return;
    await deleteDoc(doc(pathFor('participants'), participantId));
    await addAudit('participant.deleted', { participantId });
    setNotice('Participante eliminado.');
  };

  const saveConfig = async (config) => {
    const configId = `${config.category}__${config.modality}`.replaceAll(' ', '_');
    if (!window.confirm('Confirmar configuracion de categoria/modalidad.')) return;
    await setDoc(doc(pathFor('configs'), configId), {
      ...config,
      updatedAt: nowIso(),
      updatedBy: userId || null,
    }, { merge: true });
    await addAudit('config.saved', { configId });
    setNotice('Configuracion guardada.');
  };

  const saveAssignment = async (assignment) => {
    if (!assignment.judgeUid) {
      setNotice('Selecciona un jurado.');
      return;
    }

    const juror = jurors.find((item) => item.id === assignment.judgeUid);
    await addDoc(pathFor('assignments'), {
      ...assignment,
      judgeName: juror?.name || juror?.email || assignment.judgeName,
      judgeEmail: juror?.email || '',
      createdAt: nowIso(),
      createdBy: userId || null,
    });
    await addAudit('assignment.created', assignment);
    setNotice('Jurado asignado.');
  };

  const toggleAssignment = async (assignment) => {
    await updateDoc(doc(pathFor('assignments'), assignment.id), {
      active: !assignment.active,
      updatedAt: nowIso(),
      updatedBy: userId || null,
    });
    await addAudit('assignment.toggled', { assignmentId: assignment.id, active: !assignment.active });
  };

  const createGroup = async (group) => {
    if (!window.confirm('Confirmar creacion del grupo.')) return;
    await addDoc(pathFor('groups'), {
      ...group,
      participantIds: group.participantIds || [],
      status: 'pendiente',
      active: false,
      createdAt: nowIso(),
      createdBy: userId || null,
    });
    await addAudit('group.created', group);
    setNotice('Grupo creado.');
  };

  const updateGroup = async (groupId, updates) => {
    await updateDoc(doc(pathFor('groups'), groupId), {
      ...updates,
      updatedAt: nowIso(),
      updatedBy: userId || null,
    });
  };

  const saveScore = async ({ group, participantId, value }) => {
    const scoreId = `${group.id}_${participantId}_${userId}`;
    await setDoc(doc(pathFor('scores'), scoreId), {
      groupId: group.id,
      participantId,
      judgeUid: userId,
      judgeName: auth.currentUser?.email || userId,
      category: group.category,
      modality: group.modality,
      stage: group.stage,
      value: Number(value),
      updatedAt: nowIso(),
    }, { merge: true });
  };

  const finishGroupForJudge = async (group) => {
    const groupParticipants = participants.filter((participant) => group.participantIds?.includes(participant.id));
    const judgeScores = scores.filter((score) => score.groupId === group.id && score.judgeUid === userId);
    const complete = groupParticipants.every((participant) => judgeScores.some((score) => score.participantId === participant.id));

    if (!complete) {
      setNotice('Faltan participantes por calificar en este grupo.');
      return;
    }

    await setDoc(doc(pathFor('judgeGroupStatus'), `${group.id}_${userId}`), {
      groupId: group.id,
      judgeUid: userId,
      finished: true,
      finishedAt: nowIso(),
    });
    setNotice('Grupo confirmado. Si faltan jurados, Organizacion lo vera en vivo.');
  };

  const finishStage = async (config) => {
    const relevant = participants.filter((participant) => participant.category === config.category && participant.modality === config.modality);
    const ranked = relevant.map((participant) => {
      const participantScores = scores.filter((score) => score.participantId === participant.id);
      const total = participantScores.reduce((sum, score) => sum + Number(score.value || 0), 0);
      const average = participantScores.length ? total / participantScores.length : 0;
      return { participant, total, average };
    }).sort((a, b) => b.average - a.average);
    const nextCount = Number(config.nextCount || 0);
    const qualified = nextCount ? ranked.slice(0, nextCount) : ranked;

    await setDoc(doc(pathFor('stageResults'), `${config.category}__${config.modality}__${nowIso()}`.replaceAll(' ', '_')), {
      category: config.category,
      modality: config.modality,
      nextCount,
      qualifiedIds: qualified.map((item) => item.participant.id),
      ranking: ranked.map((item) => ({
        participantId: item.participant.id,
        number: item.participant.number,
        average: item.average,
        total: item.total,
      })),
      createdAt: nowIso(),
      createdBy: userId || null,
    });
    await addAudit('stage.finished', { category: config.category, modality: config.modality, nextCount });
    setNotice('Clasificacion calculada y guardada.');
  };

  const orgNav = [
    ['summary', 'Resumen'],
    ['config', 'Concurso'],
    ['participants', 'Participantes'],
    ['groups', 'Grupos y orden'],
    ['judges', 'Jurados'],
    ['live', 'En vivo'],
    ['classification', 'Clasificacion'],
  ];
  const juryNav = [
    ['scoreNow', 'Califica Ahora'],
    ['schedule', 'Programacion'],
  ];
  const nav = role === 'jurado' ? juryNav : orgNav;

  return (
    <section style={styles.shell}>
      <aside style={styles.sidebar}>
        <div>
          <p style={styles.kicker}>{role}</p>
          <h2 style={styles.heading}>Concurso</h2>
        </div>
        <nav style={styles.nav}>
          {nav.map(([key, label]) => (
            <button
              key={key}
              type="button"
              style={activeView === key ? styles.navButtonActive : styles.navButton}
              onClick={() => setActiveView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button type="button" style={styles.logoutButton} onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? 'Cerrando...' : 'Cerrar sesion'}
        </button>
        {sessionMessage ? <p style={styles.note}>{sessionMessage}</p> : null}
      </aside>

      <main style={styles.content}>
        {notice ? <div style={styles.notice}>{notice}</div> : null}
        {role === 'jurado' ? (
          <JuryViews
            activeView={activeView}
            assignments={myAssignments}
            groups={groups}
            participants={participants}
            scores={scores}
            saveScore={saveScore}
            finishGroupForJudge={finishGroupForJudge}
            userId={userId}
          />
        ) : (
          <OrganizationViews
            activeView={activeView}
            participants={participants}
            groups={groups}
            assignments={assignments}
            scores={scores}
            configs={configs}
            jurors={jurors}
            totals={totals}
            saveParticipant={saveParticipant}
            deleteParticipant={deleteParticipant}
            saveConfig={saveConfig}
            saveAssignment={saveAssignment}
            toggleAssignment={toggleAssignment}
            createGroup={createGroup}
            updateGroup={updateGroup}
            finishStage={finishStage}
            setNotice={setNotice}
          />
        )}
      </main>
    </section>
  );
}

function OrganizationViews(props) {
  const { activeView } = props;
  if (activeView === 'config') return <ConfigView {...props} />;
  if (activeView === 'participants') return <ParticipantsView {...props} />;
  if (activeView === 'groups') return <GroupsView {...props} />;
  if (activeView === 'judges') return <JudgesView {...props} />;
  if (activeView === 'live') return <LiveView {...props} />;
  if (activeView === 'classification') return <ClassificationView {...props} />;
  return <SummaryView {...props} />;
}

function SummaryView({ totals }) {
  return (
    <section style={styles.stack}>
      <Header title="Resumen de participantes" subtitle="Conteos en tiempo real por categoria, modalidad, etapa y academia." />
      <MetricGrid
        items={[
          ['Total participantes', Object.values(totals.byCategory).reduce((sum, count) => sum + count, 0)],
          ['Pendientes de calificar', totals.pending],
          ['Ya calificados', totals.scored],
        ]}
      />
      <TwoColumns>
        <KeyValue title="Por categoria" data={totals.byCategory} />
        <KeyValue title="Por modalidad" data={totals.byModality} />
        <KeyValue title="Categoria + modalidad" data={totals.byPair} />
        <KeyValue title="Por etapa" data={totals.byStage} />
        <KeyValue title="Por academia" data={totals.byAcademy} />
      </TwoColumns>
    </section>
  );
}

function ConfigView({ configs, saveConfig }) {
  const [form, setForm] = useState(emptyConfig);
  const toggleStage = (stage) => {
    setForm((current) => ({
      ...current,
      stages: current.stages.includes(stage)
        ? current.stages.filter((item) => item !== stage)
        : [...current.stages, stage],
    }));
  };

  return (
    <section style={styles.stack}>
      <Header title="Configuracion del concurso" subtitle="Define que categoria/modalidad participa, etapas, final directa y cuantos pasan." />
      <div style={styles.formGrid}>
        <Select label="Categoria" value={form.category} options={CATEGORIES} onChange={(value) => setForm({ ...form, category: value })} />
        <Select label="Modalidad" value={form.modality} options={MODALITIES} onChange={(value) => setForm({ ...form, modality: value })} />
        <label style={styles.checkbox}><input type="checkbox" checked={form.participates} onChange={(e) => setForm({ ...form, participates: e.target.checked })} /> Participa</label>
        <label style={styles.checkbox}><input type="checkbox" checked={form.directFinal} onChange={(e) => setForm({ ...form, directFinal: e.target.checked, stages: e.target.checked ? ['Final'] : form.stages })} /> Final directa</label>
        <Input label="Clasifican a siguiente etapa" type="number" value={form.nextCount} onChange={(value) => setForm({ ...form, nextCount: value })} />
      </div>
      <div style={styles.stageRow}>
        {STAGES.map((stage) => (
          <label key={stage} style={styles.chip}>
            <input type="checkbox" checked={form.stages.includes(stage)} onChange={() => toggleStage(stage)} />
            {stage}
          </label>
        ))}
      </div>
      <button type="button" style={styles.primaryButton} onClick={() => saveConfig(form)}>Guardar configuracion</button>
      <DataTable
        columns={['Categoria', 'Modalidad', 'Participa', 'Etapas', 'Pasan']}
        rows={configs.map((config) => [
          config.category,
          config.modality,
          config.participates ? 'Si' : 'No',
          (config.stages || []).join(' > '),
          config.nextCount || 0,
        ])}
      />
    </section>
  );
}

function ParticipantsView({ participants, saveParticipant, deleteParticipant, setNotice }) {
  const [form, setForm] = useState(emptyParticipant);
  const [editingId, setEditingId] = useState(null);
  const [bulkText, setBulkText] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const ok = await saveParticipant(form, editingId);
    if (ok) {
      setForm(emptyParticipant);
      setEditingId(null);
    }
  };

  const importRows = async () => {
    const rows = rowsFromPastedTable(bulkText);
    if (!rows.length) {
      setNotice('No se detectaron filas para importar.');
      return;
    }
    if (!window.confirm(`Confirmar importacion de ${rows.length} participantes.`)) return;
    for (const row of rows) await saveParticipant(row);
    setBulkText('');
    setNotice('Carga importada. Puedes pegar desde Excel o CSV.');
  };

  return (
    <section style={styles.stack}>
      <Header title="Participantes" subtitle="CRUD completo, carga manual y pegado desde Excel/CSV. Los numeros repetidos avisan, no bloquean." />
      <form style={styles.formGrid} onSubmit={submit}>
        <Input label="Nombre Participante 1" value={form.participant1} onChange={(value) => setForm({ ...form, participant1: value })} />
        <Input label="Nombre Participante 2" value={form.participant2} onChange={(value) => setForm({ ...form, participant2: value })} />
        <Select label="Categoria" value={form.category} options={CATEGORIES} onChange={(value) => setForm({ ...form, category: value })} />
        <Select label="Modalidad" value={form.modality} options={MODALITIES} onChange={(value) => setForm({ ...form, modality: value })} />
        <Input label="Academia" value={form.academy} onChange={(value) => setForm({ ...form, academy: value })} />
        <Input label="Numero de participacion" value={form.number} onChange={(value) => setForm({ ...form, number: value })} />
        <Select label="Etapa actual" value={form.currentStage} options={STAGES} onChange={(value) => setForm({ ...form, currentStage: value })} />
        <Select label="Estado" value={form.status} options={['pendiente', 'activo', 'calificado', 'eliminado']} onChange={(value) => setForm({ ...form, status: value })} />
        <button type="submit" style={styles.primaryButton}>{editingId ? 'Guardar cambios' : 'Crear participante'}</button>
      </form>
      <textarea
        style={styles.textarea}
        value={bulkText}
        onChange={(event) => setBulkText(event.target.value)}
        placeholder="Pega desde Excel: Nombre 1, Nombre 2, Categoria, Modalidad, Academia, Numero"
      />
      <button type="button" style={styles.secondaryButton} onClick={importRows}>Importar filas pegadas</button>
      <DataTable
        columns={['N', 'Participante', 'Categoria', 'Modalidad', 'Academia', 'Etapa', 'Estado', 'Acciones']}
        rows={participants.map((participant) => [
          participant.number,
          [participant.participant1, participant.participant2].filter(Boolean).join(' / '),
          participant.category,
          participant.modality,
          participant.academy,
          participant.currentStage,
          participant.status,
          <span style={styles.actions}>
            <button type="button" style={styles.smallButton} onClick={() => { setEditingId(participant.id); setForm({ ...emptyParticipant, ...participant }); }}>Editar</button>
            <button type="button" style={styles.smallDanger} onClick={() => deleteParticipant(participant.id)}>Eliminar</button>
          </span>,
        ])}
      />
    </section>
  );
}

function GroupsView({ participants, groups, createGroup, updateGroup }) {
  const [group, setGroup] = useState({ name: 'Grupo 1', category: 'Junior', modality: 'Nacional', stage: 'Eliminatoria', order: 1, participantIds: [] });
  const eligible = participants.filter((participant) => participant.category === group.category && participant.modality === group.modality && participant.currentStage === group.stage);

  const randomize = (targetGroup) => {
    const shuffled = [...(targetGroup.participantIds || [])].sort(() => Math.random() - 0.5);
    updateGroup(targetGroup.id, { participantIds: shuffled });
  };

  return (
    <section style={styles.stack}>
      <Header title="Grupos y orden" subtitle="Crea grupos, mueve participantes, activa bloques y reorganiza orden." />
      <div style={styles.formGrid}>
        <Input label="Nombre grupo" value={group.name} onChange={(value) => setGroup({ ...group, name: value })} />
        <Select label="Categoria" value={group.category} options={CATEGORIES} onChange={(value) => setGroup({ ...group, category: value })} />
        <Select label="Modalidad" value={group.modality} options={MODALITIES} onChange={(value) => setGroup({ ...group, modality: value })} />
        <Select label="Etapa" value={group.stage} options={STAGES} onChange={(value) => setGroup({ ...group, stage: value })} />
        <Input label="Orden" type="number" value={group.order} onChange={(value) => setGroup({ ...group, order: Number(value) })} />
      </div>
      <div style={styles.pickList}>
        {eligible.map((participant) => (
          <label key={participant.id} style={styles.checkbox}>
            <input
              type="checkbox"
              checked={group.participantIds.includes(participant.id)}
              onChange={(event) => setGroup({
                ...group,
                participantIds: event.target.checked
                  ? [...group.participantIds, participant.id]
                  : group.participantIds.filter((id) => id !== participant.id),
              })}
            />
            {participantLabel(participant)}
          </label>
        ))}
      </div>
      <button type="button" style={styles.primaryButton} onClick={() => createGroup(group)}>Crear grupo</button>
      {groups.map((item) => (
        <div key={item.id} style={styles.block}>
          <strong>{item.name} - {item.category} / {item.modality} / {item.stage}</strong>
          <p style={styles.muted}>{(item.participantIds || []).map((id) => participantLabel(participants.find((participant) => participant.id === id) || {})).join(', ') || 'Sin participantes'}</p>
          <div style={styles.actions}>
            <button type="button" style={styles.smallButton} onClick={() => updateGroup(item.id, { active: !item.active })}>{item.active ? 'Desactivar' : 'Activar'}</button>
            <button type="button" style={styles.smallButton} onClick={() => randomize(item)}>Orden aleatorio</button>
            <button type="button" style={styles.smallButton} onClick={() => updateGroup(item.id, { participantIds: [...(item.participantIds || [])].reverse() })}>Invertir orden</button>
          </div>
        </div>
      ))}
    </section>
  );
}

function JudgesView({ jurors, assignments, saveAssignment, toggleAssignment }) {
  const [form, setForm] = useState(emptyAssignment);

  return (
    <section style={styles.stack}>
      <Header title="Asignacion de jurados" subtitle="Activa manualmente que ve y califica cada jurado." />
      <div style={styles.formGrid}>
        <Select label="Jurado" value={form.judgeUid} options={jurors.map((juror) => ({ value: juror.id, label: juror.name || juror.email || juror.id }))} onChange={(value) => setForm({ ...form, judgeUid: value })} />
        <Select label="Categoria" value={form.category} options={CATEGORIES} onChange={(value) => setForm({ ...form, category: value })} />
        <Select label="Modalidad" value={form.modality} options={MODALITIES} onChange={(value) => setForm({ ...form, modality: value })} />
        <Select label="Etapa" value={form.stage} options={STAGES} onChange={(value) => setForm({ ...form, stage: value })} />
        <label style={styles.checkbox}><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Activo</label>
        <button type="button" style={styles.primaryButton} onClick={() => saveAssignment(form)}>Asignar jurado</button>
      </div>
      <DataTable
        columns={['Jurado', 'Categoria', 'Modalidad', 'Etapa', 'Estado', 'Accion']}
        rows={assignments.map((assignment) => [
          assignment.judgeName || assignment.judgeEmail || assignment.judgeUid,
          assignment.category,
          assignment.modality,
          assignment.stage,
          assignment.active ? 'Activo' : 'Inactivo',
          <button type="button" style={styles.smallButton} onClick={() => toggleAssignment(assignment)}>{assignment.active ? 'Desactivar' : 'Activar'}</button>,
        ])}
      />
    </section>
  );
}

function LiveView({ participants, groups, assignments, scores }) {
  return (
    <section style={styles.stack}>
      <Header title="Seguimiento en vivo" subtitle="Puntajes por jurado, pendientes y grupos activos." />
      {groups.map((group) => {
        const groupParticipants = participants.filter((participant) => group.participantIds?.includes(participant.id));
        const groupAssignments = assignments.filter((assignment) => assignment.active && assignment.category === group.category && assignment.modality === group.modality && assignment.stage === group.stage);
        return (
          <div key={group.id} style={styles.block}>
            <strong>{group.name} - {group.category} / {group.modality} / {group.stage} {group.active ? '(activo)' : ''}</strong>
            <DataTable
              columns={['Participante', ...groupAssignments.map((assignment) => assignment.judgeName || assignment.judgeEmail || 'Jurado'), 'Estado']}
              rows={groupParticipants.map((participant) => {
                const rowScores = groupAssignments.map((assignment) => scores.find((score) => score.groupId === group.id && score.participantId === participant.id && score.judgeUid === assignment.judgeUid)?.value ?? 'Pendiente');
                const complete = rowScores.every((value) => value !== 'Pendiente');
                return [participantLabel(participant), ...rowScores, complete ? 'Completo' : 'Incompleto'];
              })}
            />
          </div>
        );
      })}
    </section>
  );
}

function ClassificationView({ configs, finishStage }) {
  return (
    <section style={styles.stack}>
      <Header title="Clasificacion" subtitle="Calcula automaticamente clasificados por promedio y guarda la decision." />
      {configs.map((config) => (
        <div key={config.id} style={styles.block}>
          <strong>{config.category} / {config.modality}</strong>
          <p style={styles.muted}>Etapas: {(config.stages || []).join(' > ')}. Clasifican: {config.nextCount || 0}</p>
          <button type="button" style={styles.primaryButton} onClick={() => finishStage(config)}>Calcular y guardar clasificados</button>
        </div>
      ))}
    </section>
  );
}

function JuryViews({ activeView, assignments, groups, participants, scores, saveScore, finishGroupForJudge, userId }) {
  if (activeView === 'schedule') {
    return <ScheduleView assignments={assignments} groups={groups} />;
  }
  return <ScoreNowView assignments={assignments} groups={groups} participants={participants} scores={scores} saveScore={saveScore} finishGroupForJudge={finishGroupForJudge} userId={userId} />;
}

function ScoreNowView({ assignments, groups, participants, scores, saveScore, finishGroupForJudge, userId }) {
  const visibleGroups = groups.filter((group) => group.active && assignments.some((assignment) => assignment.category === group.category && assignment.modality === group.modality && assignment.stage === group.stage));

  return (
    <section style={styles.stack}>
      <Header title="Califica Ahora" subtitle="Solo ves categorias, modalidades y etapas activas asignadas a tu usuario." />
      {visibleGroups.map((group) => {
        const groupParticipants = participants.filter((participant) => group.participantIds?.includes(participant.id));
        return (
          <div key={group.id} style={styles.block}>
            <strong>{group.name} - {group.category} / {group.modality} / {group.stage}</strong>
            {groupParticipants.map((participant) => {
              const score = scores.find((item) => item.groupId === group.id && item.participantId === participant.id && item.judgeUid === userId);
              return (
                <div key={participant.id} style={score ? styles.scoredRow : styles.pendingRow}>
                  <span>{participantLabel(participant)}</span>
                  <input
                    style={styles.scoreInput}
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    defaultValue={score?.value || ''}
                    onBlur={(event) => {
                      if (event.target.value !== '') saveScore({ group, participantId: participant.id, value: event.target.value });
                    }}
                  />
                </div>
              );
            })}
            <button type="button" style={styles.primaryButton} onClick={() => finishGroupForJudge(group)}>Confirmar grupo terminado</button>
          </div>
        );
      })}
      {!visibleGroups.length ? <p style={styles.muted}>No tienes grupos activos para calificar ahora.</p> : null}
    </section>
  );
}

function ScheduleView({ assignments, groups }) {
  return (
    <section style={styles.stack}>
      <Header title="Programacion" subtitle="Tu agenda personal por categoria, modalidad, etapa y estado." />
      <DataTable
        columns={['Categoria', 'Modalidad', 'Etapa', 'Grupos', 'Estado']}
        rows={assignments.map((assignment) => {
          const relatedGroups = groups.filter((group) => group.category === assignment.category && group.modality === assignment.modality && group.stage === assignment.stage);
          return [
            assignment.category,
            assignment.modality,
            assignment.stage,
            relatedGroups.map((group) => group.name).join(', ') || 'Sin grupos',
            relatedGroups.some((group) => group.active) ? 'activo' : 'pendiente',
          ];
        })}
      />
    </section>
  );
}

function Header({ title, subtitle }) {
  return (
    <header>
      <h2 style={styles.title}>{title}</h2>
      <p style={styles.subtitle}>{subtitle}</p>
    </header>
  );
}

function MetricGrid({ items }) {
  return (
    <div style={styles.metricGrid}>
      {items.map(([label, value]) => (
        <div key={label} style={styles.metric}>
          <span style={styles.metricValue}>{value}</span>
          <span style={styles.muted}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function TwoColumns({ children }) {
  return <div style={styles.twoColumns}>{children}</div>;
}

function KeyValue({ title, data }) {
  return (
    <div style={styles.block}>
      <strong>{title}</strong>
      {Object.entries(data).map(([key, value]) => (
        <div key={key} style={styles.keyValue}>
          <span>{key}</span>
          <strong>{value}</strong>
        </div>
      ))}
      {!Object.keys(data).length ? <p style={styles.muted}>Sin datos</p> : null}
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  const normalized = options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option));
  return (
    <label style={styles.field}>
      <span>{label}</span>
      <select style={styles.input} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecciona</option>
        {normalized.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Input({ label, value, onChange, type = 'text' }) {
  return (
    <label style={styles.field}>
      <span>{label}</span>
      <input style={styles.input} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>{columns.map((column) => <th key={column} style={styles.th}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => <td key={cellIndex} style={styles.td}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <p style={styles.muted}>Sin registros</p> : null}
    </div>
  );
}

const styles = {
  shell: {
    display: 'grid',
    gridTemplateColumns: '220px minmax(0, 1fr)',
    minHeight: 620,
    width: 'min(1180px, calc(100vw - 32px))',
    background: '#f8fafc',
    color: '#111827',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    overflow: 'hidden',
  },
  sidebar: { display: 'grid', alignContent: 'start', gap: 18, background: '#0f172a', color: '#eff6ff', padding: 18 },
  content: { minWidth: 0, padding: 20, overflow: 'auto' },
  nav: { display: 'grid', gap: 8 },
  navButton: { border: '1px solid #334155', background: '#111827', color: '#eff6ff', padding: '10px 12px', textAlign: 'left', borderRadius: 6, cursor: 'pointer' },
  navButtonActive: { border: '1px solid #38bdf8', background: '#0c4a6e', color: '#eff6ff', padding: '10px 12px', textAlign: 'left', borderRadius: 6, cursor: 'pointer' },
  logoutButton: { border: '1px solid #64748b', background: '#020617', color: '#eff6ff', padding: '10px 12px', borderRadius: 6, cursor: 'pointer' },
  kicker: { margin: 0, fontSize: 12, textTransform: 'uppercase', color: '#93c5fd' },
  heading: { margin: 0, fontSize: 22 },
  title: { margin: 0, fontSize: 24 },
  subtitle: { margin: '6px 0 0', color: '#475569', fontSize: 14 },
  note: { margin: 0, color: '#bfdbfe', fontSize: 12 },
  notice: { padding: 10, borderRadius: 6, background: '#dbeafe', color: '#1e3a8a' },
  stack: { display: 'grid', gap: 16 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' },
  field: { display: 'grid', gap: 5, fontSize: 13, fontWeight: 700 },
  input: { border: '1px solid #cbd5e1', borderRadius: 6, padding: '9px 10px', background: '#fff', color: '#111827' },
  textarea: { minHeight: 110, border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, fontFamily: 'Arial, sans-serif' },
  primaryButton: { border: 0, borderRadius: 6, background: '#2563eb', color: '#fff', padding: '10px 12px', cursor: 'pointer', fontWeight: 700 },
  secondaryButton: { border: '1px solid #94a3b8', borderRadius: 6, background: '#fff', color: '#111827', padding: '10px 12px', cursor: 'pointer', fontWeight: 700 },
  smallButton: { border: '1px solid #94a3b8', borderRadius: 6, background: '#fff', color: '#111827', padding: '6px 8px', cursor: 'pointer' },
  smallDanger: { border: '1px solid #fecaca', borderRadius: 6, background: '#fee2e2', color: '#991b1b', padding: '6px 8px', cursor: 'pointer' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  checkbox: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
  chip: { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #cbd5e1', borderRadius: 999, padding: '7px 10px', background: '#fff' },
  stageRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  pickList: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, maxHeight: 180, overflow: 'auto', border: '1px solid #e2e8f0', padding: 10, borderRadius: 6 },
  block: { border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', padding: 12 },
  muted: { color: '#64748b', fontSize: 13, margin: 0 },
  metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  metric: { border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', padding: 12, display: 'grid', gap: 4 },
  metricValue: { fontSize: 28, fontWeight: 800 },
  twoColumns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 },
  keyValue: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #f1f5f9' },
  tableWrap: { overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' },
  td: { padding: 10, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  scoredRow: { display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12, alignItems: 'center', padding: 10, borderRadius: 6, background: '#dcfce7', marginTop: 8 },
  pendingRow: { display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12, alignItems: 'center', padding: 10, borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0', marginTop: 8 },
  scoreInput: { border: '1px solid #94a3b8', borderRadius: 6, padding: '8px 10px' },
};
