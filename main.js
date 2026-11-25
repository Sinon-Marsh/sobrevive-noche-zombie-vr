// =============================================================
// main.js · Une las partes del equipo
//   js/escenario.js → Avryl   ·   js/controles.js → Gamaliel   ·   js/juego.js → Eduardo
// Basado en el ejemplo index4.html / main4.js / style4.css (threejs-vr-look)
// =============================================================
import * as THREE from 'three';
import { crearEscenario, LIMITE } from './js/escenario.js';
import { crearControles } from './js/controles.js';
import { crearJuego } from './js/juego.js';

// ---------- Carga de recursos ----------
const manager = new THREE.LoadingManager();
const txtCarga = document.getElementById( 'cargando' );
const btnPC = document.getElementById( 'btnPC' );
btnPC.disabled = true;
manager.onProgress = ( url, a, b ) => { txtCarga.textContent = `Cargando recursos… ${Math.round( a / b * 100 )}%`; };
manager.onLoad = () => { txtCarga.textContent = '¡Listo! Elige cómo jugar.'; btnPC.disabled = false; };

// ---------- Renderizador, escena, cámara (1ª persona) ----------
const canvas = document.getElementById( 'scene' );
const renderer = new THREE.WebGLRenderer( { canvas, antialias: true } );
renderer.setPixelRatio( Math.min( devicePixelRatio, 2 ) );
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

const ctx = { renderer, scene, camera, player, manager, LIMITE };

crearEscenario( ctx );
crearControles( ctx );
crearJuego( ctx );

// ---------- Inicio desde la portada ----------
const portada = document.getElementById( 'portada' );
let pausado = false;
function empezar() { portada.classList.add( 'oculta' ); ctx.juego.reiniciar(); }
btnPC.addEventListener( 'click', () => {
	ctx.activarPC();
	if ( pausado ) { pausado = false; portada.classList.add( 'oculta' ); } else empezar();
} );

renderer.xr.addEventListener( 'sessionstart', () => {
	camera.position.set( 0, 0, 0 ); camera.rotation.set( 0, 0, 0 );
	player.rotation.set( 0, 0, 0 );
	ctx.juego.mostrarPanelVR( true );
	document.getElementById( 'mira' ).style.display = 'none';
	empezar();
} );
renderer.xr.addEventListener( 'sessionend', () => {
	camera.position.set( 0, 1.6, 0 );
	ctx.juego.mostrarPanelVR( false );
	document.getElementById( 'mira' ).style.display = '';
	portada.classList.remove( 'oculta' );
} );
document.addEventListener( 'pointerlockchange', () => {
	// en PC: al salir del ratón (Esc) se muestra la portada como pausa
	if ( ctx.modoPC && ! document.pointerLockElement && ! renderer.xr.isPresenting ) {
		ctx.modoPC = false; pausado = true; portada.classList.remove( 'oculta' ); btnPC.textContent = '▶️ Continuar en PC';
	}
} );

// ---------- Ciclo principal ----------
const reloj = new THREE.Clock();
renderer.setAnimationLoop( () => {
	const dt = Math.min( reloj.getDelta(), 0.05 );
	ctx.actualizarControles( dt );
	ctx.actualizarJuego( dt, reloj.elapsedTime );
	ctx.actualizarEscenario();
	renderer.render( scene, camera );
} );

addEventListener( 'resize', () => {
	camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
	renderer.setSize( innerWidth, innerHeight );
} );
