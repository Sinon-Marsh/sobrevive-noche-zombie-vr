// =============================================================
// main.js · Une las partes del equipo y controla los estados del juego
//   js/escenario.js → Avryl  ·  js/interfaz.js → Avryl
//   js/controles.js → Gamaliel  ·  js/juego.js → Eduardo
// Basado en el ejemplo index4.html / main4.js / style4.css (threejs-vr-look)
//
// Estados: carga → menu → jugando ⇄ pausa → fin → (menu | jugando)
// =============================================================
import * as THREE from 'three';
import { crearEscenario, LIMITE } from './js/escenario.js';
import { crearControles } from './js/controles.js';
import { crearJuego } from './js/juego.js';
import { crearInterfaz } from './js/interfaz.js';
import { cargarAjustes } from './js/ajustes.js';

const $ = ( s ) => document.querySelector( s );

// ---------- Carga de recursos ----------
const manager = new THREE.LoadingManager();
manager.onProgress = ( url, a, b ) => {
	const p = Math.round( a / b * 100 );
	$( '#cargaBarra' ).style.width = p + '%'; $( '#cargaPct' ).textContent = p + '%';
	const nombre = url.split( '/' ).pop();
	$( '#cargaTexto' ).textContent = nombre.endsWith( '.fbx' ) ? 'Despertando a los zombies…' : nombre.endsWith( '.mp3' ) ? 'Afinando los sonidos de la noche…' : 'Preparando el jardín de la mansión…';
};
manager.onLoad = () => { setTimeout( () => { ctx.ui.ocultar( 'carga' ); if ( ctx.estado === 'carga' ) irAlMenu(); }, 400 ); };

// ---------- Renderizador, escena, cámara (1ª persona) ----------
const canvas = $( '#scene' );
const renderer = new THREE.WebGLRenderer( { canvas, antialias: true } );
renderer.setSize( innerWidth, innerHeight );
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType( 'local-floor' );
renderer.xr.setFoveation( 1 );

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 72, innerWidth / innerHeight, 0.05, 1000 );
camera.rotation.order = 'YXZ';
camera.position.set( 0, 1.6, 0 );          // altura de los ojos en modo PC (en VR la da el visor)
const player = new THREE.Group();          // "cuerpo" del jugador: se mueve con los controles
player.add( camera );
scene.add( player );

const ctx = { renderer, scene, camera, player, manager, LIMITE, ajustes: cargarAjustes(), estado: 'carga', modo: 'pc' };

crearInterfaz( ctx );
crearEscenario( ctx );
crearControles( ctx );
crearJuego( ctx );

// ---------- Ajustes que se aplican en vivo ----------
ctx.aplicarAjustes = () => {
	const a = ctx.ajustes;
	renderer.toneMappingExposure = a.brillo;
	const escala = { alta: Math.min( devicePixelRatio, 2 ), media: 1, baja: 0.7 }[ a.calidad ] ?? 1;
	renderer.setPixelRatio( escala );
	renderer.xr.setFramebufferScaleFactor?.( a.calidad === 'baja' ? 0.8 : 1 );
	camera.fov = a.fov; camera.updateProjectionMatrix();
	document.body.classList.toggle( 'mira', a.mira );
	$( '#radarCaja' ).style.display = a.radar ? '' : 'none';
	$( '#fps' ).style.display = a.fps ? 'block' : 'none';
	ctx.aplicarEscenario?.(); ctx.aplicarAudio?.();
};
ctx.aplicarAjustes();

// ---------- Cambios de estado ----------
function irAlMenu() {
	ctx.estado = 'menu';
	if ( renderer.xr.isPresenting ) renderer.xr.getSession()?.end();
	document.exitPointerLock?.();
	ctx.juego.detener(); ctx.juego.reanudarAudio();
	ctx.menuVR.ocultar();
	[ 'pausa', 'fin', 'ajustes' ].forEach( ( id ) => ctx.ui.ocultar( id ) );
	document.body.classList.remove( 'jugando' );
	player.position.set( 0, 0, 0 );
	ctx.ui.pintarStats(); ctx.ui.siguienteConsejo(); ctx.ui.mostrar( 'menu' );
}
function jugar( modo ) {
	ctx.modo = modo; ctx.estado = 'jugando';
	[ 'menu', 'pausa', 'fin', 'ajustes' ].forEach( ( id ) => ctx.ui.ocultar( id ) );
	ctx.menuVR.ocultar();
	document.body.classList.add( 'jugando' );
	ctx.reiniciarVista();
	ctx.juego.reanudarAudio();
	ctx.juego.reiniciar();
	if ( modo === 'pc' ) ctx.activarPC();
}
function pausar() {
	if ( ctx.estado !== 'jugando' ) return;
	ctx.estado = 'pausa';
	const J = ctx.juego.estado;
	$( '#pausaInfo' ).textContent = `Nivel ${J.nivel} · ${J.recogidas}/${J.meta} calabazas · ${J.puntos.toLocaleString( 'es-MX' )} pts`;
	if ( renderer.xr.isPresenting ) ctx.menuVR.mostrar();
	else { document.exitPointerLock?.(); ctx.ui.mostrar( 'pausa' ); }
	ctx.juego.pausarAudio();
}
function reanudar() {
	if ( ctx.estado !== 'pausa' ) return;
	ctx.estado = 'jugando';
	ctx.ui.ocultar( 'pausa' ); ctx.ui.ocultar( 'ajustes' ); ctx.menuVR.ocultar();
	ctx.juego.reanudarAudio();
	if ( ! renderer.xr.isPresenting ) ctx.bloquearRaton();
	reloj.getDelta();
}
Object.assign( ctx, { irAlMenu, jugar, pausar, reanudar } );
ctx.alTerminar = () => { ctx.estado = 'fin'; setTimeout( () => document.exitPointerLock?.(), 1500 ); };

// Esc libera el ratón → pausa automática
document.addEventListener( 'pointerlockchange', () => {
	if ( ! document.pointerLockElement && ctx.estado === 'jugando' && ! renderer.xr.isPresenting ) pausar();
} );
// si la pestaña se oculta, también se pausa
document.addEventListener( 'visibilitychange', () => { if ( document.hidden ) pausar(); } );

// ---------- VR ----------
renderer.xr.addEventListener( 'sessionstart', () => {
	camera.position.set( 0, 0, 0 ); camera.rotation.set( 0, 0, 0 ); player.rotation.set( 0, 0, 0 );
	ctx.juego.mostrarPanelVR( true );
	jugar( 'vr' );
} );
renderer.xr.addEventListener( 'sessionend', () => {
	camera.position.set( 0, 1.6, 0 );
	ctx.juego.mostrarPanelVR( false );
	if ( ctx.estado !== 'menu' ) irAlMenu();
} );

// ---------- Ciclo principal ----------
const reloj = new THREE.Clock();
renderer.setAnimationLoop( () => {
	const dt = Math.min( reloj.getDelta(), 0.05 );
	const t = reloj.elapsedTime;
	ctx.actualizarControles( dt );
	if ( ctx.estado !== 'pausa' ) {
		ctx.actualizarJuego( dt, t );
		ctx.actualizarEscenario( dt, t );
	}
	if ( ctx.estado === 'jugando' && ! renderer.xr.isPresenting ) ctx.actualizarRadar( dt );
	if ( ctx.estado === 'menu' && ! renderer.xr.isPresenting ) {
		// cámara lenta y cinematográfica detrás del menú
		player.rotation.y = t * 0.05; camera.rotation.set( -0.05, 0, 0 );
		player.position.set( Math.sin( t * 0.05 ) * 6, 0, Math.cos( t * 0.05 ) * 6 );
	}
	if ( ctx.ajustes.fps ) ctx.ui.fps( dt );
	renderer.render( scene, camera );
} );

addEventListener( 'resize', () => {
	camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
	renderer.setSize( innerWidth, innerHeight );
} );
