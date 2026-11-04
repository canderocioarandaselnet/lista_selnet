/**
 * Utilidad para asignar colores armónicos por familia técnica a las categorías y subcategorías
 * del catálogo de Selnet.
 */
export function getCategoryColorClass(name?: string | null): string {
  if (!name) return 'cat-color-default';
  const upper = name.trim().toUpperCase();

  // 1. CCTV / Cámaras / Video (Cyan / Sky)
  if (/CAMARA|DOMO|PTZ|BULLET|VCA|TERMIC|OJO DE PEZ|VORTEX|EZVIZ/.test(upper)) {
    return 'cat-color-cyan';
  }
  // 2. Grabación / Almacenamiento (Púrpura / Violeta)
  if (/NVR|DVR|DISCO|SKYHAWK|PSTOR|DECODER|ALMACENAMIENTO/.test(upper)) {
    return 'cat-color-purple';
  }
  // 3. Control de Acceso / Biometría (Esmeralda / Verde)
  if (/ACCESO|CERRADURA|TERMINAL|PATENTE|LPR|AFORO|HUELLA|FACIAL/.test(upper)) {
    return 'cat-color-emerald';
  }
  // 4. Alarmas / Intrusión (Ámbar / Naranja)
  if (/ALARMA|INTRUSION|BARRERA|DETECTOR|POWER NEO|TECLADO/.test(upper)) {
    return 'cat-color-amber';
  }
  // 5. Incendio / Detección (Rojo Carmesí)
  if (/INCENDIO|DETECCION|FIRECLASS|J400|EN54|HUMO/.test(upper)) {
    return 'cat-color-red';
  }
  // 6. Software / Licencias / VMS (Índigo Royal)
  if (/SOFTWARE|DIGIFORT|HIKCENTRAL|HIKPARTNER|LICENCIA|MIDDLEWARE|ANALYTIC|CMS/.test(upper)) {
    return 'cat-color-indigo';
  }
  // 7. Redes / Networking (Teal / Turquesa)
  if (/SWITCH|BALUN|TRANSCEIVER|POE|ENLACE|WIRELESS|ROUTER/.test(upper)) {
    return 'cat-color-teal';
  }
  // 8. Intercom / Audio / Portería (Fucsia / Rosa)
  if (/PORTERO|MEGAFONIA|PARLANTE|MICROFONO|INTERCOM/.test(upper)) {
    return 'cat-color-pink';
  }
  // 9. Energía / Alimentación (Amarillo Oro)
  if (/BATERIA|FUENTE|UPS|CABLE|CONECTOR|SOLAR/.test(upper)) {
    return 'cat-color-yellow';
  }
  // 10. Novedades / Destacados / Accesorios (Lima / Verde Claro)
  if (/NUEVO|OFERTA|SMART HOME|ACCESORIO|SOPORTE/.test(upper)) {
    return 'cat-color-lime';
  }

  // Fallback determinista por hash para cualquier categoría fuera de las reglas
  const palette = [
    'cat-color-cyan',
    'cat-color-purple',
    'cat-color-emerald',
    'cat-color-amber',
    'cat-color-red',
    'cat-color-indigo',
    'cat-color-teal',
    'cat-color-pink',
    'cat-color-yellow',
    'cat-color-lime',
  ];
  let hash = 0;
  for (let i = 0; i < upper.length; i++) {
    hash = (hash << 5) - hash + upper.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}
