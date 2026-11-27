// =============================================================
// interfaz.js · Responsable: Avryl Chavez Tavera
// Menú principal, ajustes, pausa, pantalla final, HUD, avisos y radar.
// =============================================================
import { DIFICULTADES, POR_DEFECTO, guardarAjustes, cargarStats, guardarStats } from './ajustes.js';

const $ = ( s ) => document.querySelector( s );
const $$ = ( s ) => [ ...document.querySelectorAll( s ) ];

// Esquema de la ventana de ajustes (se construye automáticamente)
const ESQUEMA = {
	juego: [
		{ k: 'dificultad', t: 'Dificultad', d: 'Vidas, número y velocidad de los zombies', tipo: 'sel', op: Object.entries( DIFICULTADES ).map( ( [ v, o ] ) => [ v, o.nombre ] ) },
		{ k: 'relampagos', t: 'Relámpagos y truenos', d: 'Destellos de luz con trueno cada cierto tiempo', tipo: 'bool' },
		{ k: 'avisos', t: 'Avisos en pantalla', d: 'Mensajes de nivel, vida extra, esquives…', tipo: 'bool' }
	],
	video: [
		{ k: 'brillo', t: 'Brillo', d: 'Exposición de la escena', tipo: 'rango', min: 0.5, max: 1.8, paso: 0.05, fmt: ( v ) => Math.round( v * 100 ) + '%' },
		{ k: 'niebla', t: 'Densidad de niebla', d: '0% la desactiva', tipo: 'rango', min: 0, max: 2, paso: 0.05, fmt: ( v ) => Math.round( v * 100 ) + '%' },
		{ k: 'fov', t: 'Campo de visión (PC)', d: 'Ángulo de la cámara', tipo: 'rango', min: 55, max: 100, paso: 1, fmt: ( v ) => v + '°' },
		{ k: 'calidad', t: 'Calidad gráfica', d: 'Resolución interna de render', tipo: 'sel', op: [ [ 'baja', 'Baja' ], [ 'media', 'Media' ], [ 'alta', 'Alta' ] ] },
		{ k: 'sombras', t: 'Sombras', d: 'Sombras de la luz de luna', tipo: 'bool' },
		{ k: 'luciernagas', t: 'Luciérnagas', d: 'Partículas de luz flotando', tipo: 'bool' },
		{ k: 'fps', t: 'Mostrar FPS', d: 'Cuadros por segundo', tipo: 'bool' }
	],
	audio: [
		{ k: 'volGeneral', t: 'Volumen general', tipo: 'rango', min: 0, max: 1, paso: 0.01, fmt: pct },
		{ k: 'volMusica', t: 'Música', tipo: 'rango', min: 0, max: 1, paso: 0.01, fmt: pct },
		{ k: 'volEfectos', t: 'Efectos de sonido', tipo: 'rango', min: 0, max: 1, paso: 0.01, fmt: pct },
		{ k: 'volAmbiente', t: 'Ambiente (viento)', tipo: 'rango', min: 0, max: 1, paso: 0.01, fmt: pct },
		{ k: 'latidos', t: 'Latidos del corazón', d: 'Suenan cuando un zombie está cerca', tipo: 'bool' }
	],
	controles: [
		{ k: 'sensibilidad', t: 'Sensibilidad del ratón', tipo: 'rango', min: 0.3, max: 2.5, paso: 0.05, fmt: ( v ) => v.toFixed( 2 ) + 'x' },
		{ k: 'invertirY', t: 'Invertir eje vertical', tipo: 'bool' },
		{ k: 'velocidad', t: 'Velocidad al caminar', tipo: 'rango', min: 0.6, max: 1.6, paso: 0.05, fmt: ( v ) => v.toFixed( 2 ) + 'x' },
		{ k: 'giroVR', t: 'Giro en VR (stick derecho)', d: 'Por pasos evita el mareo', tipo: 'sel', op: [ [ 'paso30', '30°' ], [ 'paso45', '45°' ], [ 'suave', 'Suave' ] ] },
		{ k: 'mira', t: 'Mostrar mira', tipo: 'bool' },
		{ k: 'radar', t: 'Mostrar radar', d: 'Zombies y calabazas cercanas', tipo: 'bool' }
	]
};
function pct( v ) { return Math.round( v * 100 ) + '%'; }

export function crearInterfaz( ctx ) {
	const A = ctx.ajustes;
	let pestaña = 'juego';

	// ---------------- Pantallas ----------------
	function mostrar( id ) { $( '#' + id ).classList.add( 'visible' ); }
	function ocultar( id ) { $( '#' + id ).classList.remove( 'visible' ); }

	// ---------------- Navegación del menú ----------------
	$$( '#nav button' ).forEach( ( b ) => b.addEventListener( 'click', () => {
		if ( b.dataset.accion === 'ajustes' ) return abrirAjustes();
		$$( '#nav button' ).forEach( ( x ) => x.classList.toggle( 'activo', x === b ) );
		$$( '.seccion' ).forEach( ( s ) => s.classList.toggle( 'activa', s.id === 'sec-' + b.dataset.sec ) );
		if ( b.dataset.sec === 'records' ) pintarRecords();
		ctx.sonidoUI?.();
	} ) );

	// selector de dificultad en la tarjeta principal
	const selDif = $( '#selDificultad' );
	function pintarDificultad() { selDif.querySelectorAll( 'button' ).forEach( ( b ) => b.classList.toggle( 'activo', b.dataset.v === A.dificultad ) ); }
	selDif.addEventListener( 'click', ( e ) => {
		const v = e.target.dataset?.v; if ( ! v ) return;
		A.dificultad = v; guardarAjustes( A ); pintarDificultad(); ctx.sonidoUI?.();
	} );
	pintarDificultad();

	// ---------------- Ajustes ----------------
	function abrirAjustes() { pintarAjustes(); mostrar( 'ajustes' ); ctx.sonidoUI?.(); }
	$$( '#tabsAjustes button' ).forEach( ( b ) => b.addEventListener( 'click', () => {
		pestaña = b.dataset.tab;
		$$( '#tabsAjustes button' ).forEach( ( x ) => x.classList.toggle( 'activo', x === b ) );
		pintarAjustes();
	} ) );
	$$( '[data-cerrar]' ).forEach( ( b ) => b.addEventListener( 'click', () => { ocultar( b.dataset.cerrar ); pintarDificultad(); } ) );
	$( '#btnRestablecer' ).addEventListener( 'click', () => {
		Object.assign( A, POR_DEFECTO ); guardarAjustes( A ); ctx.aplicarAjustes(); pintarAjustes(); pintarDificultad();
	} );

	function pintarAjustes() {
		const panel = $( '#panelAjustes' ); panel.innerHTML = '';
		ESQUEMA[ pestaña ].forEach( ( op ) => {
			const fila = document.createElement( 'div' ); fila.className = 'fila';
			fila.innerHTML = `<div><b>${op.t}</b>${op.d ? `<small>${op.d}</small>` : ''}</div><div class="ctrl"></div>`;
			const ctrl = fila.querySelector( '.ctrl' );
			if ( op.tipo === 'rango' ) {
				const r = document.createElement( 'input' ); Object.assign( r, { type: 'range', min: op.min, max: op.max, step: op.paso, value: A[ op.k ] } );
				const o = document.createElement( 'output' );
				const pinta = () => { o.textContent = op.fmt( +r.value ); r.style.setProperty( '--p', ( ( r.value - op.min ) / ( op.max - op.min ) * 100 ) + '%' ); };
				r.addEventListener( 'input', () => { A[ op.k ] = +r.value; pinta(); cambiar(); } );
				pinta(); ctrl.append( r, o );
			} else if ( op.tipo === 'bool' ) {
				ctrl.innerHTML = `<label class="switch"><input type="checkbox" ${A[ op.k ] ? 'checked' : ''}><span></span></label>`;
				ctrl.querySelector( 'input' ).addEventListener( 'change', ( e ) => { A[ op.k ] = e.target.checked; cambiar(); ctx.sonidoUI?.(); } );
			} else {
				const s = document.createElement( 'div' ); s.className = 'selector';
				op.op.forEach( ( [ v, n ] ) => {
					const b = document.createElement( 'button' ); b.textContent = n; b.classList.toggle( 'activo', A[ op.k ] === v );
					b.addEventListener( 'click', () => { A[ op.k ] = v; s.querySelectorAll( 'button' ).forEach( ( x ) => x.classList.toggle( 'activo', x === b ) ); cambiar(); ctx.sonidoUI?.(); } );
					s.append( b );
				} );
				ctrl.append( s );
			}
			panel.append( fila );
		} );
	}
	function cambiar() { guardarAjustes( A ); ctx.aplicarAjustes(); }

	// ---------------- Botones de juego / pausa / fin ----------------
	$( '#btnJugar' ).addEventListener( 'click', () => ctx.jugar( 'pc' ) );
	$( '#btnPausa' ).addEventListener( 'click', () => ctx.pausar() );
	$( '#btnContinuar' ).addEventListener( 'click', () => ctx.reanudar() );
	$( '#btnPausaAjustes' ).addEventListener( 'click', abrirAjustes );
	$( '#btnReiniciar' ).addEventListener( 'click', () => { ocultar( 'pausa' ); ctx.jugar( ctx.modo ); } );
	$( '#btnMenu' ).addEventListener( 'click', () => ctx.irAlMenu() );
	$( '#btnFinOtra' ).addEventListener( 'click', () => { ocultar( 'fin' ); ctx.jugar( ctx.modo ); } );
	$( '#btnFinMenu' ).addEventListener( 'click', () => ctx.irAlMenu() );
	$( '#btnBorrarRecords' ).addEventListener( 'click', () => { const s = cargarStats(); s.mejores = []; guardarStats( s ); pintarRecords(); pintarStats(); } );

	// ---------------- Estadísticas y récords ----------------
	function pintarStats() {
		const s = cargarStats();
		$( '#stPartidas' ).textContent = s.partidas;
		$( '#stVictorias' ).textContent = `${s.victorias} ${s.victorias === 1 ? 'victoria' : 'victorias'}`;
		$( '#stCalabazas' ).textContent = s.calabazas;
		$( '#stEsquives' ).textContent = s.esquives;
		const m = s.mejores[ 0 ];
		$( '#stMejor' ).textContent = m ? m.puntos.toLocaleString( 'es-MX' ) : '—';
		$( '#stMejorTiempo' ).textContent = m ? `${m.gano ? 'Victoria' : 'Nivel ' + m.nivel} · ${formato( m.tiempo )}` : 'Aún sin récord';
	}
	function pintarRecords() {
		const s = cargarStats(), tb = $( '#tablaRecords tbody' );
		tb.innerHTML = s.mejores.length ? '' : '<tr><td colspan="7" class="tenue">Todavía no hay partidas. ¡Juega una!</td></tr>';
		s.mejores.forEach( ( m, i ) => {
			tb.insertAdjacentHTML( 'beforeend', `<tr><td>${[ '🥇', '🥈', '🥉' ][ i ] || i + 1}</td><td>${m.puntos.toLocaleString( 'es-MX' )}</td><td>${m.gano ? '🏆 Sobrevivió' : '🧟 Atrapado'}</td><td>${m.nivel}</td><td>${formato( m.tiempo )}</td><td>${DIFICULTADES[ m.dificultad ]?.nombre ?? '—'}</td><td>${m.fecha}</td></tr>` );
		} );
	}
	pintarStats();

	// consejos aleatorios en el menú
	const CONSEJOS = [
		'Los zombies giran despacio: si uno te persigue, haz un quiebre hacia un lado y lo verás tropezar.',
		'Si escuchas latidos, mira el radar: el punto rojo es el zombie que te está persiguiendo.',
		'La calabaza dorada aparece una vez por nivel. Vale una vida extra y 250 puntos.',
		'En VR, el teletransporte (gatillo derecho) es la mejor forma de escapar cuando te rodean.',
		'Usa la linterna (F o gatillo izquierdo) para ver mejor entre las lápidas cuando hay niebla.',
		'Cada calabaza que recoges vuelve a los zombies un poco más rápidos. ¡No te confíes!',
		'Terminar rápido da bonus de tiempo; terminar con vidas extra suma 300 puntos por cada una.',
		'Si te mareas en VR, cambia el giro a pasos de 30° o 45° en Ajustes › Controles.'
	];
	let iConsejo = Math.floor( Math.random() * CONSEJOS.length );
	const pintarConsejo = () => { $( '#txtConsejo' ).textContent = CONSEJOS[ iConsejo % CONSEJOS.length ]; };
	$( '#btnConsejo' ).addEventListener( 'click', () => { iConsejo ++; pintarConsejo(); ctx.sonidoUI?.(); } );
	pintarConsejo();

	function registrarPartida( d ) {
		const s = cargarStats();
		s.partidas ++; if ( d.gano ) s.victorias ++;
		s.calabazas += d.calabazas; s.esquives += d.esquives; s.tiempoTotal += d.tiempo;
		const reg = { puntos: d.puntos, gano: d.gano, nivel: d.nivel, tiempo: d.tiempo, dificultad: d.dificultad, fecha: new Date().toLocaleDateString( 'es-MX' ) };
		const anterior = s.mejores[ 0 ]?.puntos ?? -1;
		s.mejores.push( reg ); s.mejores.sort( ( a, b ) => b.puntos - a.puntos ); s.mejores = s.mejores.slice( 0, 8 );
		guardarStats( s ); pintarStats();
		return d.puntos > anterior;
	}

	// ---------------- Pantalla final ----------------
	function fin( d ) {
		const record = registrarPartida( d );
		$( '#finIcono' ).textContent = d.gano ? '🏆' : '🧟';
		$( '#finTitulo' ).textContent = d.gano ? '¡Sobreviviste a la noche!' : '¡Te atraparon!';
		$( '#finSub' ).textContent = d.gano ? `Superaste los ${d.niveles} niveles en dificultad ${DIFICULTADES[ d.dificultad ].nombre}` : `Llegaste al nivel ${d.nivel} de ${d.niveles}`;
		$( '#finPuntos' ).textContent = d.puntos.toLocaleString( 'es-MX' );
		$( '#finTiempo' ).textContent = formato( d.tiempo );
		$( '#finNivel' ).textContent = `${d.nivel} / ${d.niveles}`;
		$( '#finCalabazas' ).textContent = d.calabazas;
		$( '#finEsquives' ).textContent = d.esquives;
		$( '#finVidas' ).textContent = d.vidasPerdidas;
		$( '#finRecord' ).style.display = record ? 'block' : 'none';
		setTimeout( () => mostrar( 'fin' ), 1600 );
		return record;
	}

	// ---------------- HUD ----------------
	const h = { niv: $( '#hudNivel' ), pts: $( '#hudPuntos' ), cal: $( '#hudCalabazas' ), prog: $( '#hudProgreso' ), vid: $( '#hudVidas' ), tie: $( '#hudTiempo' ) };
	function hud( d ) {
		h.niv.textContent = `${d.nivel} / ${d.niveles}`;
		h.pts.textContent = d.puntos.toLocaleString( 'es-MX' );
		h.cal.textContent = `${d.recogidas} / ${d.meta}`;
		h.prog.style.width = ( d.recogidas / d.meta * 100 ) + '%';
		h.vid.textContent = '❤'.repeat( Math.max( 0, d.vidas ) ) || '—';
		h.tie.textContent = formato( d.tiempo );
	}
	function toast( texto, color ) {
		if ( ! A.avisos ) return;
		const t = document.createElement( 'div' ); t.className = 'toast'; t.textContent = texto;
		if ( color ) t.style.borderColor = color;
		$( '#toasts' ).append( t ); setTimeout( () => t.remove(), 3100 );
	}

	// ---------------- Radar ----------------
	const rc = $( '#radar' ).getContext( '2d' ), R = 90, ALCANCE = 18;
	let barrido = 0;
	function radar( pos, yaw, zombies, calabazas, dorada, dt ) {
		barrido += dt * 2.2;
		rc.clearRect( 0, 0, 180, 180 );
		rc.save(); rc.translate( R, R );
		const g = rc.createRadialGradient( 0, 0, 10, 0, 0, R ); g.addColorStop( 0, 'rgba(124,92,255,.18)' ); g.addColorStop( 1, 'rgba(10,14,40,.2)' );
		rc.fillStyle = g; rc.beginPath(); rc.arc( 0, 0, R - 1, 0, 7 ); rc.fill();
		rc.strokeStyle = 'rgba(148,163,255,.18)'; rc.lineWidth = 1;
		[ 0.33, 0.66, 0.98 ].forEach( ( k ) => { rc.beginPath(); rc.arc( 0, 0, R * k, 0, 7 ); rc.stroke(); } );
		rc.beginPath(); rc.moveTo( -R, 0 ); rc.lineTo( R, 0 ); rc.moveTo( 0, -R ); rc.lineTo( 0, R ); rc.stroke();
		// barrido
		rc.rotate( barrido );
		const sw = rc.createLinearGradient( 0, 0, R, 0 ); sw.addColorStop( 0, 'rgba(56,189,248,.35)' ); sw.addColorStop( 1, 'rgba(56,189,248,0)' );
		rc.fillStyle = sw; rc.beginPath(); rc.moveTo( 0, 0 ); rc.arc( 0, 0, R, -0.35, 0 ); rc.fill();
		rc.rotate( -barrido );
		const punto = ( x, z, color, r ) => {
			const dx = x - pos.x, dz = z - pos.z;
			// rotar al marco de la vista (arriba = adelante)
			const c = Math.cos( yaw ), s = Math.sin( yaw );
			const rx = dx * c - dz * s, rz = dx * s + dz * c;
			let px = rx / ALCANCE * R, py = rz / ALCANCE * R;
			const d = Math.hypot( px, py ); if ( d > R - 6 ) { px *= ( R - 6 ) / d; py *= ( R - 6 ) / d; }
			rc.fillStyle = color; rc.shadowColor = color; rc.shadowBlur = 8;
			rc.beginPath(); rc.arc( px, py, r, 0, 7 ); rc.fill(); rc.shadowBlur = 0;
		};
		calabazas.forEach( ( c ) => c.visible && punto( c.position.x, c.position.z, '#ff9a2e', 3.2 ) );
		if ( dorada.visible ) punto( dorada.position.x, dorada.position.z, '#ffd34d', 4.5 );
		zombies.forEach( ( z ) => punto( z.position.x, z.position.z, z.userData.estado === 'perseguir' ? '#ff4d6d' : '#c0c7e8', 3.6 ) );
		// jugador
		rc.fillStyle = '#8be04e'; rc.beginPath(); rc.moveTo( 0, -8 ); rc.lineTo( 6, 6 ); rc.lineTo( -6, 6 ); rc.closePath(); rc.fill();
		rc.restore();
	}

	// ---------------- FPS ----------------
	let fpsN = 0, fpsT = 0; const fpsEl = $( '#fps' );
	function fps( dt ) { fpsN ++; fpsT += dt; if ( fpsT > 0.5 ) { fpsEl.textContent = Math.round( fpsN / fpsT ) + ' FPS'; fpsN = 0; fpsT = 0; } }

	ctx.ui = { mostrar, ocultar, hud, toast, radar, fin, fps, pintarStats, abrirAjustes, siguienteConsejo: () => { iConsejo ++; pintarConsejo(); } };
}

export function formato( s ) { const m = Math.floor( s / 60 ), r = Math.floor( s % 60 ); return `${m}:${String( r ).padStart( 2, '0' )}`; }
