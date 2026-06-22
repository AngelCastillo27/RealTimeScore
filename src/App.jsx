//App.jsx es el componente principal de la aplicación. 
// Maneja la selección de roles, el inicio de sesión y
//  la visualización del panel principal según el rol del usuario.

import { useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import ViewPrincipal from './viewPrincipal'; // Importa ViewPrincipal
import { auth, db } from './firebase.js';

const roles = [
  { key: 'admin', label: 'Admin' },
  { key: 'organizacion', label: 'Organización' },
  { key: 'jurado', label: 'Jurado' },
];

const createSessionToken = () => {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export default function App() {
  const [openMenu, setOpenMenu] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [loggedInRole, setLoggedInRole] = useState('');
  const [activeSession, setActiveSession] = useState(null);

  const activeRoleLabel = roles.find((item) => item.key === loggedInRole)?.label || 'Usuario';
  const roleColors = {
    admin: '#edeef2',
    organizacion: '#dc2626',
    jurado: '#2563eb',
  };
  const welcomeColor = roleColors[loggedInRole] || '#f8fafc';

  const chooseRole = (role) => {
    setSelectedRole(role.key);
    setOpenMenu(false);
  };

  useEffect(() => {
    if (!activeSession) return undefined;

    const userDocRef = doc(db, 'usuarios', activeSession.uid);
    return onSnapshot(userDocRef, async (snapshot) => {
      const serverToken = snapshot.data()?.sessionToken || null;

      if (serverToken && serverToken !== activeSession.sessionToken) {
        localStorage.removeItem(activeSession.sessionKey);
        setActiveSession(null);
        setLoggedInRole('');
        setMessage('Tu sesiÃ³n se cerrÃ³ porque esta cuenta se abriÃ³ en otro dispositivo.');
        await signOut(auth);
      }
    });
  }, [activeSession]);

  const reserveSession = async (userDocRef, user, role) => {
    const sessionKey = `scoreSession:${user.uid}`;
    const browserToken = localStorage.getItem(sessionKey);
    const nextToken = createSessionToken();

    const result = await runTransaction(db, async (transaction) => {
      const userSnapshot = await transaction.get(userDocRef);

      if (!userSnapshot.exists()) {
        return {
          ok: false,
          reason: 'No se pudo crear o leer el documento de usuario en Firestore.',
        };
      }

      const userData = userSnapshot.data();
      if (userData.tipoUsuario !== role) {
        return {
          ok: false,
          reason: `Esta cuenta no corresponde al rol seleccionado (${role}).`,
        };
      }

      const existingToken = userData.sessionToken || null;
      if (existingToken && existingToken !== browserToken) {
        return {
          ok: false,
          reason: 'Esta cuenta ya esta abierta en otro dispositivo o navegador.',
        };
      }

      transaction.update(userDocRef, {
        sessionToken: nextToken,
        lastLoginAt: new Date().toISOString(),
      });

      return {
        ok: true,
        role: userData.tipoUsuario,
        uid: user.uid,
        sessionKey,
        sessionToken: nextToken,
      };
    });

    if (result.ok) {
      localStorage.setItem(result.sessionKey, result.sessionToken);
    }

    return result;
  };

  const getLoginErrorMessage = (error) => {
    const code = String(error?.code || '');
    const message = String(error?.message || '');

    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || /invalid credential|wrong-password|user-not-found/i.test(message)) {
      return 'Credenciales inválidas. Revisa el correo y la contraseña en Firebase Authentication.';
    }

    if (code === 'permission-denied' || /permission/i.test(message)) {
      return 'Firebase está bloqueando acceso a Firestore. Revisa las reglas de la colección usuarios.';
    }

    if (code === 'auth/too-many-requests' || /too many requests/i.test(message)) {
      return 'Demasiados intentos. Espera un momento antes de volver a intentar.';
    }

    if (code === 'auth/network-request-failed' || /network/i.test(message)) {
      return 'No se pudo conectar con Firebase. Revisa tu conexión a internet.';
    }

    return 'No se pudo iniciar sesión. Revisa correo y contraseña.';
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password || !selectedRole) return;

    setLoading(true);
    setMessage('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const normalizedEmail = user.email?.toLowerCase() || '';
      const userDocRef = doc(db, 'usuarios', user.uid);
      let userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          tipoUsuario: selectedRole,
          email: normalizedEmail,
          createdAt: new Date().toISOString(),
          sessionToken: null,
          lastLoginAt: null,
        }, { merge: true });
        userDoc = await getDoc(userDocRef);
      }

      if (!userDoc || !userDoc.exists()) {
        setMessage('No se pudo crear o leer el documento de usuario en Firestore.');
        await signOut(auth);
        setLoading(false);
        return;
      }

      const sessionResult = await reserveSession(userDocRef, user, selectedRole);
      if (!sessionResult.ok) {
        setMessage(sessionResult.reason);
        await signOut(auth);
        setLoading(false);
        return;
      }

      setLoggedInRole(sessionResult.role);
      setActiveSession({
        uid: sessionResult.uid,
        sessionKey: sessionResult.sessionKey,
        sessionToken: sessionResult.sessionToken,
      });
      setMessage('Inicio de sesión correcto.');
    } catch (error) {
      console.error(error);
      setMessage(getLoginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        {!loggedInRole ? (
          <>
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
          </>
        ) : (
          <ViewPrincipal role={loggedInRole} />
        )}
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
  simpleWelcome: {
    minHeight: 160,
    display: 'grid',
    placeItems: 'center',
    textAlign: 'center',
  },
  simpleWelcomeTitle: { fontSize: 26, margin: 0, lineHeight: 1.2 },
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
