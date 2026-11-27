// =============================================================
// ajustes.js · Configuración del juego (se guarda en el navegador)
// =============================================================

export const DIFICULTADES = {
	facil:     { nombre: 'Fácil',     vidas: 5, velZombie: 0.8,  zombies: [ 3, 4, 6 ], vision: 7,  calabazas: 6 },
	normal:    { nombre: 'Normal',    vidas: 3, velZombie: 1,    zombies: [ 4, 6, 8 ], vision: 9,  calabazas: 8 },
	pesadilla: { nombre: 'Pesadilla', vidas: 2, velZombie: 1.25, zombies: [ 6, 8, 11 ], vision: 12, calabazas: 10 }
};

export const POR_DEFECTO = {
	// Juego
	dificultad: 'normal',
	relampagos: true,
	avisos: true,
	// Video
	brillo: 1.0,          // exposición del tone mapping
	niebla: 1.0,          // multiplicador de densidad
	sombras: true,
	calidad: 'alta',      // alta | media | baja  (resolución interna)
	fov: 72,
	luciernagas: true,
	fps: false,
	// Audio
	volGeneral: 0.9,
	volMusica: 0.5,
	volEfectos: 0.9,
	volAmbiente: 0.5,
	latidos: true,
	// Controles
	sensibilidad: 1.0,
	invertirY: false,
	velocidad: 1.0,
	giroVR: 'paso30',     // paso30 | paso45 | suave
	mira: true,
	radar: true
};

const CLAVE = 'zombieVR.ajustes';

export function cargarAjustes() {
	try { return { ...POR_DEFECTO, ...JSON.parse( localStorage.getItem( CLAVE ) || '{}' ) }; }
	catch { return { ...POR_DEFECTO }; }
}
export function guardarAjustes( a ) {
	try { localStorage.setItem( CLAVE, JSON.stringify( a ) ); } catch {}
}

// ---------- Estadísticas y récords ----------
const CLAVE_STATS = 'zombieVR.stats';
export function cargarStats() {
	const base = { partidas: 0, victorias: 0, calabazas: 0, esquives: 0, tiempoTotal: 0, mejores: [] };
	try { return { ...base, ...JSON.parse( localStorage.getItem( CLAVE_STATS ) || '{}' ) }; }
	catch { return base; }
}
export function guardarStats( s ) {
	try { localStorage.setItem( CLAVE_STATS, JSON.stringify( s ) ); } catch {}
}
