import { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import ViewPrincipal from './viewPrincipal.jsx';
import { auth, db } from './firebase.js';

const roles = [
  { key: 'admin', label: 'Admin' },
  { key: 'organizacion', label: 'Organización' },
  { key: 'jurado', label: 'Jurado' },
];

export default function App() {
  const [openMenu, setOpenMenu] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const chooseRole = (role) => {
    setSelectedRole(role.key);
    setOpenMenu(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password || !selectedRole) return;

    setLoading(true);
    setMessage('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userDocRef = doc(db, 'usuarios', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          tipoUsuario: selectedRole,
          email: user.email,
          createdAt: new Date().toISOString(),
          sessionToken: null,
          lastLoginAt: null,
        });
      }

      const roleFromDb = userDoc.data().tipoUsuario;
      if (roleFromDb !== selectedRole) {
        setMessage(`Esta cuenta no corresponde al rol seleccionado (${selectedRole}).`);
        await signOut(auth);
        setLoading(false);
        return;
      }

      if (roleFromDb === 'jurado' || roleFromDb === 'organizacion') {
        const sessionToken = crypto.randomUUID();
        const sessionKey = `scoreSession:${user.uid}`;
        const currentBrowserToken = localStorage.getItem(sessionKey);
        const existingSessionToken = userDoc.data().sessionToken || null;

        if (existingSessionToken && existingSessionToken !== currentBrowserToken) {
          setMessage('Esta cuenta ya está abierta en otro dispositivo o navegador.');
          await signOut(auth);
          setLoading(false);
          return;
        }

        localStorage.setItem(sessionKey, sessionToken);
        await updateDoc(userDocRef, {
          sessionToken,
          lastLoginAt: new Date().toISOString(),
        });
      }

      setMessage('Inicio de sesión correcto.');
    } catch (error) {
      console.error(error);
      setMessage('No se pudo iniciar sesión. Revisa correo y contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.eyebrow}>Puntajes</p>
        <h1 style={styles.title}>Selecciona tu usuario</h1>
        <p style={styles.subtitle}>Elige tu rol desde el desplegable y, en el mismo lugar, inicia sesión.</p>

        <div style={styles.dropdownWrap}>
          <button type="button" onClick={() => setOpenMenu((prev) => !prev)} style={styles.dropdownButton}>
            {selectedRole ? roles.find((item) => item.key === selectedRole)?.label : 'Elige un tipo de usuario'}
          </button>

          {openMenu && (
            <div style={styles.dropdownMenu}>
              {roles.map((role) => (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => chooseRole(role)}
                  style={styles.dropdownItem}
                >
                  {role.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedRole && (
          <form onSubmit={handleLogin} style={styles.form}>
            <label style={styles.label}>Correo</label>
            <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />

            <label style={styles.label}>Contraseña</label>
            <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="********" />

            <button type="submit" style={styles.submitButton} disabled={loading}>
              {loading ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
            {message ? <p style={styles.message}>{message}</p> : null}
          </form>
        )}

        {selectedRole && <ViewPrincipal role={selectedRole} />}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: 'linear-gradient(135deg, #0f172a, #111827 45%, #1e293b)',
    color: '#e5eefb',
    fontFamily: 'Inter, Arial, sans-serif',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    background: 'rgba(15, 23, 42, 0.92)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: 24,
    padding: 28,
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.45)',
  },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 3, color: '#38bdf8', fontSize: 12, fontWeight: 700 },
  title: { fontSize: 28, lineHeight: 1.2, marginTop: 8, marginBottom: 8 },
  subtitle: { color: '#cbd5e1', fontSize: 14, marginBottom: 18 },
  dropdownWrap: { display: 'grid', gap: 8, marginBottom: 14 },
  dropdownButton: {
    border: '1px solid #334155',
    borderRadius: 14,
    background: '#111827',
    color: '#eff6ff',
    padding: '12px 14px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  dropdownMenu: {
    border: '1px solid #334155',
    borderRadius: 14,
    background: '#0b1220',
    overflow: 'hidden',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    border: 0,
    background: 'transparent',
    color: '#eff6ff',
    padding: '10px 12px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  form: { display: 'grid', gap: 8, marginBottom: 16 },
  label: { color: '#bfdbfe', fontSize: 13 },
  input: {
    border: '1px solid #334155',
    borderRadius: 12,
    background: '#0f172a',
    color: '#eff6ff',
    padding: '10px 12px',
  },
  submitButton: {
    border: 0,
    borderRadius: 12,
    background: '#2563eb',
    color: '#eff6ff',
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  message: { color: '#bfdbfe', fontSize: 13, marginTop: 4 },
};
