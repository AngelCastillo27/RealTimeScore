import React from 'react';

export default function ViewJurado() {
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ fontSize: 24, margin: 0, color: '#2563eb' }}>Panel Jurado</h2>
      <p style={{ color: '#1d4ed8', margin: 0 }}>Acceso principal para evaluación, observaciones y revisión de criterios.</p>
      <ul style={{ color: '#1e40af', paddingLeft: 18, lineHeight: 1.5, margin: 0 }}>
        <li>Calificar participantes</li>
        <li>Registrar comentarios</li>
        <li>Revisar rúbricas</li>
      </ul>
    </section>
  );
}
