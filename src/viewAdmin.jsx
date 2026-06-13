import React from 'react';

export default function ViewAdmin() {
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ fontSize: 24, margin: 0, color: '#111827' }}>Panel Admin</h2>
      <p style={{ color: '#475569', margin: 0 }}>Acceso principal para administración, seguimiento y control del concurso.</p>
      <ul style={{ color: '#334155', paddingLeft: 18, lineHeight: 1.5, margin: 0 }}>
        <li>Gestionar usuarios</li>
        <li>Ver puntajes globales</li>
        <li>Administrar concursos</li>
      </ul>
    </section>
  );
}
