import React from 'react';

export default function ViewOrg() {
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ fontSize: 24, margin: 0, color: '#b91c1c' }}>Panel Organización</h2>
      <p style={{ color: '#991b1b', margin: 0 }}>Acceso principal para la organización del evento y su coordinación.</p>
      <ul style={{ color: '#7f1d1d', paddingLeft: 18, lineHeight: 1.5, margin: 0 }}>
        <li>Actualizar información del evento</li>
        <li>Revisar participantes</li>
        <li>Consultar estado del concurso</li>
      </ul>
    </section>
  );
}
