// viewPrincipal.jsx es el componente que muestra 
// la vista principal según el rol del usuario.
import React from 'react';

const ROLE_CONTENT = {
  admin: {
    title: 'Panel Admin',
    intro: 'Acceso principal para administración, seguimiento y control del concurso.',
    items: ['Gestionar usuarios', 'Ver puntajes globales', 'Administrar concursos'],
  },
  organizacion: {
    title: 'Panel Organización',
    intro: 'Acceso principal para la organización del evento y su coordinación.',
    items: ['Actualizar información del evento', 'Revisar participantes', 'Consultar estado del concurso'],
  },
  jurado: {
    title: 'Panel Jurado',
    intro: 'Acceso principal para evaluación, observaciones y revisión de criterios.',
    items: ['Calificar participantes', 'Registrar comentarios', 'Revisar rúbricas'],
  },
};

export default function ViewPrincipal({ role }) {
  // Fallback al rol admin si el rol proporcionado no existe
  const data = ROLE_CONTENT[role] || ROLE_CONTENT.admin;

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ fontSize: 24, margin: 0 }}>{data.title}</h2>
      <p style={{ color: '#cbd5e1', margin: 0 }}>{data.intro}</p>
      <ul style={{ color: '#e2e8f0', paddingLeft: 18, lineHeight: 1.5, margin: 0 }}>
        {data.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
