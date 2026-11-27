// =============================================================
// juego.js  ·  Responsable: Eduardo Martínez Trujillo
// Reglas del juego, zombies (FBX de Mixamo), calabazas, vidas,
// música de fondo, efectos de sonido y marcador (PC + VR).
// =============================================================
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { DIFICULTADES } from './ajustes.js';
import { formato } from './interfaz.js';

const MAX_CALABAZAS = 10, VIDAS_MAX = 6, MAX_ZOMBIES = 16;
const RADIO_ATAQUE = 0.9;
const PUNTOS = { calabaza: 100, dorada: 250, esquive: 50, nivel: 300, aturdir: 75, empujon: 50 };
const N_PODRIDAS = 7;                // calabazas podridas para lanzar
const T_ATURDIDO = 4.5;              // segundos que un zombie queda en el suelo
const VEL_EMPUJON = 2.1;             // m/s mínimos de la mano para empujar

// ---- Dificultad progresiva: depende del total de calabazas recogidas (modo infinito) ----
function progreso( J ) {
	const n = J.totalCalabazas;
	return {
		vel: J.dif.velZombie * ( 1 + Math.min( n, 70 ) * 0.02 ),                       // hasta 2.4x más rápidos
		vision: Math.min( J.dif.vision + n * 0.1, 18 ),                                // te ven desde más lejos
		zombies: Math.min( J.dif.zombies[ 0 ] + Math.floor( n / 4 ), MAX_ZOMBIES ),    // uno más cada 4 calabazas
		oleadaCada: Math.max( 10, 30 - n * 0.5 ),                                     // salen de la tumba más seguido
		giro: 1.9 + Math.min( n, 60 ) * 0.012                                           // y giran un poco más rápido
	};
}
const VEL_DEAMBULAR = 0.55, VEL_PERSEGUIR = 1.25;
const ANGULO_ESQUIVE = 1.1;       // si quedas a más de ~63° de su frente estando cerca → se tropiezan

export function crearJuego( ctx ) {
	const { scene, camera, player, manager } = ctx;

	// =================== SONIDO ===================
	const listener = new THREE.AudioListener();
	camera.add( listener );
	const cargarAudio = new THREE.AudioLoader( manager );
	const buffers = {};
	[ 'recoger', 'grunido', 'dano', 'victoria', 'derrota', 'trueno', 'vida', 'nivel' ].forEach( ( n ) =>
		cargarAudio.load( `assets/audio/sfx_${n}.mp3`, ( b ) => { buffers[ n ] = b; } ) );

	const musica = new THREE.Audio( listener );
	const viento = new THREE.Audio( listener );
	// música de la 3.4/3.5; si no está, se usa el ambiente del ejemplo
	cargarAudio.load( 'assets/audio/zombie_dance.mp3', ( b ) => { musica.setBuffer( b ); },
		undefined, () => cargarAudio.load( 'assets/audio/forest_night.mp3', ( b ) => musica.setBuffer( b ) ) );
	cargarAudio.load( 'assets/audio/wind.mp3', ( b ) => viento.setBuffer( b ) );
	const latido = new THREE.Audio( listener );        // latido del corazón cuando un zombie está cerca
	cargarAudio.load( 'assets/audio/sfx_latido.mp3', ( b ) => { latido.setBuffer( b ); latido.setLoop( true ); latido.setVolume( 0 ); } );

	const A = ctx.ajustes;
	const volEf = () => A.volEfectos * A.volGeneral;
	function sonar( nombre, volumen = 0.9, objeto = null ) {
		if ( ! buffers[ nombre ] || volEf() <= 0 ) return;
		const s = objeto ? new THREE.PositionalAudio( listener ) : new THREE.Audio( listener );
		s.setBuffer( buffers[ nombre ] ); s.setVolume( volumen * volEf() );
		if ( objeto ) { s.setRefDistance( 2 ); objeto.add( s ); s.onEnded = () => { s.isPlaying = false; objeto.remove( s ); }; }
		s.play();
	}
	function iniciarAudio() {
		if ( listener.context.state === 'suspended' ) listener.context.resume();
		if ( musica.buffer && ! musica.isPlaying ) { musica.setLoop( true ); musica.play(); }
		if ( viento.buffer && ! viento.isPlaying ) { viento.setLoop( true ); viento.play(); }
		if ( latido.buffer && ! latido.isPlaying ) latido.play();
		aplicarAudio();
	}
	function aplicarAudio() {
		musica.setVolume( 0.6 * A.volMusica * A.volGeneral );
		viento.setVolume( 0.45 * A.volAmbiente * A.volGeneral );
	}
	ctx.aplicarAudio = aplicarAudio;
	// sonido corto para los botones del menú
	ctx.sonidoUI = () => {
		if ( listener.context.state === 'suspended' ) listener.context.resume();
		if ( ! buffers.recoger || volEf() <= 0 || ctx.estado === 'jugando' ) return;
		const s = new THREE.Audio( listener ); s.setBuffer( buffers.recoger ); s.setVolume( 0.18 * volEf() ); s.setPlaybackRate( 1.6 ); s.play();
	};
	ctx.sonar = sonar;                                  // lo usa el escenario para el trueno

	// =================== CALABAZAS ===================
	const calabazas = [];
	const caraTex = caraCalabaza();
	for ( let i = 0; i < MAX_CALABAZAS; i ++ ) {
		const mat = new THREE.MeshStandardMaterial( { color: 0xff6a00, roughness: 0.55, emissive: 0xffa040, emissiveIntensity: 0.9, emissiveMap: caraTex } );
		const g = new THREE.Group();
		const cuerpo = new THREE.Mesh( new THREE.SphereGeometry( 0.3, 24, 16 ).scale( 1.2, 0.95, 1.1 ), mat );
		cuerpo.position.y = 0.3; cuerpo.castShadow = true;
		const tallo = new THREE.Mesh( new THREE.CylinderGeometry( 0.035, 0.05, 0.14, 8 ), new THREE.MeshStandardMaterial( { color: 0x3b7a2a } ) );
		tallo.position.y = 0.6;
		g.add( cuerpo, tallo );
		g.userData = { mat, fase: Math.random() * 10 };
		scene.add( g ); calabazas.push( g );
	}

	// Calabaza dorada: aparece una vez por nivel y da una vida extra
	const dorada = new THREE.Group();
	{
		const mat = new THREE.MeshStandardMaterial( { color: 0xffd34d, metalness: 0.8, roughness: 0.25, emissive: 0xffb300, emissiveIntensity: 1.2, emissiveMap: caraTex } );
		const cuerpo = new THREE.Mesh( new THREE.SphereGeometry( 0.3, 24, 16 ).scale( 1.2, 0.95, 1.1 ), mat ); cuerpo.position.y = 0.35;
		const brillo = new THREE.PointLight( 0xffc840, 6, 6, 2 ); brillo.position.y = 0.8;
		dorada.add( cuerpo, brillo ); dorada.userData = { mat }; dorada.visible = false; scene.add( dorada );
	}

	// =================== CALABAZAS PODRIDAS (se agarran y se lanzan con las manos) ===================
	const podridas = [];
	const matPodrida = new THREE.MeshStandardMaterial( { color: 0x5d7a2e, roughness: 0.9, emissive: 0x9cff4a, emissiveIntensity: 0.12 } );
	const matMancha = new THREE.MeshStandardMaterial( { color: 0x2f3b18, roughness: 1 } );
	for ( let i = 0; i < N_PODRIDAS; i ++ ) {
		const g = new THREE.Group();
		const cuerpo = new THREE.Mesh( new THREE.SphereGeometry( 0.17, 18, 12 ).scale( 1.15, 0.9, 1.05 ), matPodrida ); cuerpo.castShadow = true;
		const mancha = new THREE.Mesh( new THREE.SphereGeometry( 0.07, 8, 6 ), matMancha ); mancha.position.set( 0.1, 0.05, 0.08 );
		const tallo = new THREE.Mesh( new THREE.CylinderGeometry( 0.02, 0.03, 0.09, 6 ), matMancha ); tallo.position.y = 0.17; tallo.rotation.z = 0.5;
		g.add( cuerpo, mancha, tallo );
		g.userData = { estado: 'suelo', vel: new THREE.Vector3(), giro: new THREE.Vector3(), mano: null, vida: 0 };
		g.visible = false; scene.add( g ); podridas.push( g );
	}
	function colocarPodrida( p ) {
		p.position.copy( lugarLibre( 3, ctx.LIMITE - 3 ) ); p.position.y = 0.16;
		p.rotation.set( 0, Math.random() * 6, 0 );
		p.userData.estado = 'suelo'; p.userData.vel.set( 0, 0, 0 ); p.userData.mano = null; p.visible = true;
	}
	// anillo verde que indica que la mano puede agarrar algo
	const anilloMano = new THREE.Mesh( new THREE.TorusGeometry( 0.22, 0.012, 6, 32 ), new THREE.MeshBasicMaterial( { color: 0x9cff4a, transparent: true, opacity: 0.8 } ) );
	anilloMano.rotation.x = Math.PI / 2; anilloMano.visible = false; scene.add( anilloMano );
	let municionPC = 0;                                  // en PC las podridas se guardan (máx. 3)

	// =================== ZOMBIES ===================
	const zombies = [];
	const fbx = new FBXLoader( manager );
	const clips = {};
	let modeloBase = null;

	function enSuLugar( clip ) {               // quita el desplazamiento de la cadera (root motion)
		clip.tracks.forEach( ( t ) => {
			if ( t.name.endsWith( '.position' ) && t.name.includes( 'Hips' ) ) {
				const v = t.values, x0 = v[ 0 ], z0 = v[ 2 ];
				for ( let i = 0; i < v.length; i += 3 ) { v[ i ] = x0; v[ i + 2 ] = z0; }
			}
		} );
		return clip;
	}

	console.log( 'juego.js v5 · modo infinito y mecánica de manos' );
	fbx.load( 'assets/models/fbx/Dancing.fbx', ( modelo ) => {
		modelo.traverse( ( c ) => {
			if ( c.isMesh ) {
				c.castShadow = true; c.frustumCulled = false;
				const mats = Array.isArray( c.material ) ? c.material : [ c.material ];
				const nuevos = mats.map( ( m ) => new THREE.MeshStandardMaterial( { map: m.map, roughness: 0.5, metalness: 0.1 } ) );
				c.material = nuevos.length === 1 ? nuevos[ 0 ] : nuevos;
			}
		} );
		modelo.scale.setScalar( 0.01 );       // Mixamo está en cm → metros
		modeloBase = modelo;
		clips.bailar = enSuLugar( modelo.animations[ 0 ] );
		const extras = { caminar: 'Walking', tambalear: 'Stumbling', morir: 'Dying', quieto: 'Idle' };
		Object.entries( extras ).forEach( ( [ k, f ] ) => fbx.load( `assets/models/fbx/${f}.fbx`,
			( a ) => { clips[ k ] = k === 'morir' ? a.animations[ 0 ] : enSuLugar( a.animations[ 0 ] ); },
			undefined, () => console.warn( 'Falta animación', f ) ) );
	}, undefined, () => console.warn( 'No se encontró Dancing.fbx: se usarán zombies simples' ) );

	function crearZombie() {
		const z = new THREE.Group();
		let mixer = null;
		if ( modeloBase ) {
			const m = SkeletonUtils.clone( modeloBase ); z.add( m );
			mixer = new THREE.AnimationMixer( m );
		} else {                                // respaldo si faltan los FBX
			const mat = new THREE.MeshStandardMaterial( { color: 0x5e8a4a, roughness: 0.8 } );
			const cuerpo = new THREE.Mesh( new THREE.CapsuleGeometry( 0.25, 1.1, 4, 12 ), mat ); cuerpo.position.y = 0.85;
			const ojos = new THREE.Mesh( new THREE.SphereGeometry( 0.06 ), new THREE.MeshBasicMaterial( { color: 0xff2a2a } ) ); ojos.position.set( 0, 1.45, 0.22 );
			cuerpo.castShadow = true; z.add( cuerpo, ojos );
		}
		z.userData = { mixer, acciones: {}, actual: null, estado: 'deambular', destino: new THREE.Vector3(), espera: 0, gruño: false,
			tropiezo: 0, cerca: false, impulso: new THREE.Vector3(), rumbo: Math.random() * Math.PI * 2, calma: 0, aturdido: 0 };
		scene.add( z );
		return z;
	}
	function animar( z, nombre, fundido = 0.35, escala = 1 ) {
		const u = z.userData; if ( ! u.mixer || ! clips[ nombre ] ) return;
		let a = u.acciones[ nombre ];
		if ( ! a ) {
			a = u.acciones[ nombre ] = u.mixer.clipAction( clips[ nombre ] );
			if ( nombre === 'morir' || nombre === 'tambalear' ) { a.setLoop( THREE.LoopOnce, 1 ); a.clampWhenFinished = true; }
		}
		if ( u.actual === a ) { a.setEffectiveTimeScale( escala ); return; }
		a.reset().setEffectiveTimeScale( escala ).fadeIn( fundido ).play();
		if ( u.actual ) u.actual.fadeOut( fundido );
		u.actual = a;
	}

	// =================== MARCADOR (PC: HTML · VR: panel flotante) ===================
	const flash = document.getElementById( 'flash' );
	const lienzo = document.createElement( 'canvas' ); lienzo.width = 640; lienzo.height = 200;
	const texPanel = new THREE.CanvasTexture( lienzo ); texPanel.colorSpace = THREE.SRGBColorSpace;
	const panel = new THREE.Mesh( new THREE.PlaneGeometry( 0.5, 0.156 ), new THREE.MeshBasicMaterial( { map: texPanel, transparent: true, depthTest: false, fog: false } ) );
	panel.position.set( 0, -0.3, -0.9 ); panel.rotation.x = -0.35; panel.renderOrder = 10; panel.visible = false;
	camera.add( panel );
	let avisoTexto = '', avisoHasta = 0, textoGrande = '', subGrande = '';
	function dibujarPanel() {
		const g = lienzo.getContext( '2d' ), W = 640, H = 200;
		g.clearRect( 0, 0, W, H );
		const grad = g.createLinearGradient( 0, 0, W, H ); grad.addColorStop( 0, 'rgba(40,30,90,0.82)' ); grad.addColorStop( 1, 'rgba(14,30,70,0.82)' );
		g.fillStyle = grad; g.strokeStyle = 'rgba(167,139,250,0.75)'; g.lineWidth = 3;
		g.beginPath(); g.roundRect( 4, 4, W - 8, H - 8, 30 ); g.fill(); g.stroke();
		g.textAlign = 'center';
		if ( textoGrande ) {
			g.fillStyle = '#ffffff'; g.font = 'bold 46px Arial'; g.fillText( textoGrande, W / 2, 86 );
			g.fillStyle = '#c4b5fd'; g.font = '26px Arial'; g.fillText( subGrande, W / 2, 140 );
		} else {
			const cols = [ [ 'OLEADA', `${J.nivel}` ], [ 'CALABAZAS', `${J.recogidas}/${J.meta}` ], [ 'VIDAS', '❤'.repeat( Math.max( 0, J.vidas ) ) ], [ 'PUNTOS', J.puntos ] ];
			cols.forEach( ( [ t, v ], i ) => {
				const x = 85 + i * 157;
				g.fillStyle = '#9aa3c7'; g.font = '20px Arial'; g.fillText( t, x, 52 );
				g.fillStyle = t === 'VIDAS' ? '#ff4d6d' : '#ffffff'; g.font = 'bold 36px Arial'; g.fillText( v, x, 96 );
			} );
			g.fillStyle = '#7dd3fc'; g.font = '26px Arial';
			g.fillText( performance.now() < avisoHasta ? avisoTexto : `⏱ ${formato( J.tiempo )}`, W / 2, 160 );
		}
		texPanel.needsUpdate = true;
	}
	function actualizarMarcador() {
		ctx.ui?.hud( { nivel: J.nivel, puntos: J.puntos, recogidas: J.recogidas, meta: J.meta, vidas: J.vidas, tiempo: J.tiempo, municion: municionPC, total: J.totalCalabazas } );
		dibujarPanel();
	}
	function aviso( texto, color, ms = 2600 ) {      // mensaje corto (PC y VR) sin detener el juego
		if ( ! A.avisos ) return;
		avisoTexto = texto; avisoHasta = performance.now() + ms;
		ctx.ui?.toast( texto, color ); dibujarPanel();
	}
	function sumar( p ) { J.puntos += p; actualizarMarcador(); }

	// =================== REGLAS ===================
	const J = { activo: false, vidas: 3, recogidas: 0, tiempo: 0, invulnerable: 0, fin: false, nivel: 1, oleada: 0, extras: 0, doradaEn: 0,
		meta: 8, puntos: 0, esquives: 0, totalCalabazas: 0, vidasPerdidas: 0, dif: DIFICULTADES.normal, clave: 'normal',
		aturdidos: 0, empujones: 0, lanzamientos: 0 };

	function lugarLibre( rMin, rMax ) {
		for ( let n = 0; n < 60; n ++ ) {
			const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * ( rMax - rMin );
			const x = Math.cos( a ) * r, z = Math.sin( a ) * r;
			if ( ctx.colliders.every( ( o ) => Math.hypot( x - o.x, z - o.z ) > o.r + 0.8 ) ) return new THREE.Vector3( x, 0, z );
		}
		return new THREE.Vector3( rMin, 0, 0 );
	}

	function agregarZombie( lejos = true ) {
		const z = crearZombie();
		// que no aparezca encima del jugador
		let pos, n = 0; do { pos = lugarLibre( lejos ? 14 : 8, ctx.LIMITE - 2 ); } while ( Math.hypot( pos.x - cab.x, pos.z - cab.z ) < 8 && ++ n < 20 );
		z.position.copy( pos );
		z.userData.destino.copy( lugarLibre( 4, ctx.LIMITE - 2 ) ); animar( z, 'caminar' ); zombies.push( z );
		return z;
	}
	function prepararNivel() {
		J.recogidas = 0; J.oleada = 0; J.extras = 0; J.invulnerable = 2;
		J.doradaEn = 15 + Math.random() * 15;
		dorada.visible = false;
		calabazas.forEach( ( c, i ) => {
			const usar = i < J.meta;
			c.visible = usar; c.userData.recogida = ! usar;
			if ( usar ) c.position.copy( lugarLibre( 5, ctx.LIMITE - 3 ) );
		} );
		camera.getWorldPosition( cab );
		const objetivo = progreso( J ).zombies;
		while ( zombies.length < objetivo ) agregarZombie();
		podridas.forEach( ( p ) => { if ( p.userData.estado !== 'mano' && p.userData.estado !== 'guardada' && p.userData.estado !== 'aire' ) colocarPodrida( p ); } );
		actualizarMarcador();
	}
	function reiniciar() {
		J.clave = DIFICULTADES[ A.dificultad ] ? A.dificultad : 'normal';
		J.dif = DIFICULTADES[ J.clave ];
		Object.assign( J, { activo: true, vidas: J.dif.vidas, tiempo: 0, fin: false, nivel: 1, meta: J.dif.calabazas,
			puntos: 0, esquives: 0, totalCalabazas: 0, vidasPerdidas: 0, aturdidos: 0, empujones: 0, lanzamientos: 0 } );
		textoGrande = ''; municionPC = 0;
		zombies.forEach( ( z ) => scene.remove( z ) ); zombies.length = 0;
		podridas.forEach( ( p ) => { if ( p.userData.mano ) { p.userData.mano.userData.sostiene = null; p.userData.mano.remove( p ); } scene.add( p ); p.userData.mano = null; p.userData.estado = 'suelo'; } );
		player.position.set( 0, 0, 0 ); player.rotation.set( 0, 0, 0 );
		prepararNivel();
		iniciarAudio();
		aviso( `Oleada 1 · ${J.dif.nombre} · ¡Recoge calabazas y defiéndete con las manos!`, '#a78bfa', 3500 );
	}
	function siguienteNivel() {
		sumar( PUNTOS.nivel * J.nivel );
		J.nivel ++;
		sonar( 'nivel', 1 ); ctx.vibrar?.( 'right', 0.6, 120 );
		prepararNivel();
		aviso( `🌙 ¡Oleada ${J.nivel}! · ${zombies.length} zombies rondan el jardín`, '#38bdf8', 3200 );
	}

	function recoger( c ) {
		if ( c.userData.recogida || ! J.activo ) return;
		c.userData.recogida = true; c.visible = false; J.recogidas ++; J.totalCalabazas ++;
		sonar( 'recoger', 0.9 ); ctx.vibrar?.( 'right', 0.4, 60 ); ctx.vibrar?.( 'left', 0.4, 60 );
		particulas( c.position.clone().setY( 0.4 ) );
		sumar( PUNTOS.calabaza );
		if ( J.recogidas >= J.meta ) siguienteNivel();      // modo infinito: siempre hay otra oleada
	}
	function recogerDorada() {
		if ( ! dorada.visible || ! J.activo ) return;
		dorada.visible = false; J.vidas = Math.min( VIDAS_MAX, J.vidas + 1 );
		sonar( 'vida', 1 ); ctx.vibrar?.( 'left', 0.7, 120 ); ctx.vibrar?.( 'right', 0.7, 120 );
		particulas( dorada.position.clone().setY( 0.5 ), 0xffd34d );
		sumar( PUNTOS.dorada );
		aviso( '✨ ¡Calabaza dorada! +1 vida', '#ffc94d' );
	}
	function agarrar( origen ) {          // grip del mando (o tecla E en PC)
		const p = new THREE.Vector3(); origen.getWorldPosition( p );
		const alcance = origen === camera ? 2.2 : 1.0;
		// ¿hay una calabaza podrida cerca de la mano? → se toma con la mano
		const mano = origen.userData?.grip;
		if ( mano && ! mano.userData.sostiene ) {
			const hp = origen.userData.pos;
			const cand = podridas.filter( ( q ) => q.visible && q.userData.estado === 'suelo' )
				.map( ( q ) => [ q, Math.hypot( hp.x - q.position.x, hp.z - q.position.z ), hp.y - q.position.y ] )
				.filter( ( [ , d, h ] ) => d < 0.6 && h < 1.1 ).sort( ( a, b ) => a[ 1 ] - b[ 1 ] )[ 0 ];
			if ( cand ) {
				const q = cand[ 0 ];
				q.userData.estado = 'mano'; q.userData.mano = mano; mano.userData.sostiene = q;
				mano.add( q ); q.position.set( 0, -0.02, -0.08 ); q.rotation.set( 0, 0, 0 );
				ctx.vibrar?.( origen.userData.mano, 0.5, 40 );
				return;
			}
		}
		if ( origen === camera && municionPC < 3 ) {       // PC: E también recoge podridas como munición
			const q = podridas.find( ( q ) => q.visible && q.userData.estado === 'suelo' && Math.hypot( p.x - q.position.x, p.z - q.position.z ) < alcance );
			if ( q ) { q.visible = false; q.userData.estado = 'guardada'; municionPC ++; actualizarMarcador(); aviso( `🟢 Calabaza podrida (${municionPC}/3) · Clic para lanzar`, '#9cff4a', 1600 ); }
		}
		calabazas.forEach( ( c ) => { if ( c.visible && Math.hypot( p.x - c.position.x, p.z - c.position.z ) < alcance ) recoger( c ); } );
		if ( dorada.visible && Math.hypot( p.x - dorada.position.x, p.z - dorada.position.z ) < alcance ) recogerDorada();
	}
	function herir( z ) {
		if ( J.invulnerable > 0 || ! J.activo ) return;
		J.vidas --; J.vidasPerdidas ++; J.invulnerable = 2.2;
		ctx.sacudir?.( 0.35 );
		sonar( 'dano', 1 ); sonar( 'grunido', 1, z );
		ctx.vibrar?.( 'left', 1, 250 ); ctx.vibrar?.( 'right', 1, 250 );
		flash.style.opacity = 1; setTimeout( () => { flash.style.opacity = 0; }, 350 );
		// el zombie retrocede
		const cab = new THREE.Vector3(); camera.getWorldPosition( cab );
		const atras = z.position.clone().sub( cab ).setY( 0 ).normalize().multiplyScalar( 3 );
		z.position.add( atras ); ctx.limitar( z.position ); z.userData.espera = 1.5;
		actualizarMarcador();
		if ( J.vidas > 0 ) aviso( `💔 ¡Te mordieron! Quedan ${J.vidas} ${J.vidas === 1 ? 'vida' : 'vidas'}`, '#ff4d6d' );
		else terminar( false );
	}
	function terminar( gano ) {
		J.activo = false; J.fin = true;
		sonar( gano ? 'victoria' : 'derrota', 1 );
		latido.setVolume( 0 );
		J.puntos += Math.round( J.tiempo ) * 2;                 // bonus por tiempo sobrevivido
		// los zombies celebran bailando
		zombies.forEach( ( z ) => animar( z, 'bailar' ) );
		const record = ctx.ui?.fin( { gano: false, puntos: J.puntos, tiempo: J.tiempo, nivel: J.nivel, calabazas: J.totalCalabazas,
			esquives: J.esquives, aturdidos: J.aturdidos, empujones: J.empujones, vidasPerdidas: J.vidasPerdidas, dificultad: J.clave } );
		textoGrande = record ? '¡Nuevo récord! 🏆' : '¡Te atraparon! 🧟';
		subGrande = `${J.puntos.toLocaleString( 'es-MX' )} pts · Botón A para jugar otra vez`;
		actualizarMarcador();
		ctx.alTerminar?.( gano );
	}

	// =================== MANOS: LANZAR Y EMPUJAR ===================
	function soltar( c ) {                               // se suelta el grip → la calabaza sale volando
		const mano = c.userData.grip, q = mano?.userData.sostiene;
		if ( ! q ) return;
		mano.userData.sostiene = null;
		const wp = new THREE.Vector3(); q.getWorldPosition( wp );
		mano.remove( q ); scene.add( q ); q.position.copy( wp );
		const v = c.userData.vel.clone().multiplyScalar( 1.6 );            // un poco de ayuda para que llegue lejos
		if ( v.length() > 16 ) v.setLength( 16 );
		lanzar( q, v );
		ctx.vibrar?.( c.userData.mano, 0.35, 30 );
	}
	function lanzar( q, v ) {
		q.userData.estado = 'aire'; q.userData.vel.copy( v ); q.userData.mano = null; q.userData.vida = 0;
		q.userData.giro.set( Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4 );
		if ( v.length() > 3 ) J.lanzamientos ++;
	}
	function lanzarPC() {
		if ( municionPC <= 0 ) { aviso( 'No tienes calabazas podridas · acércate a una verde y presiona E', '#9cff4a', 1600 ); return; }
		const q = podridas.find( ( q ) => q.userData.estado === 'guardada' ); if ( ! q ) return;
		municionPC --; actualizarMarcador();
		const d = new THREE.Vector3(); camera.getWorldDirection( d ); camera.getWorldPosition( cab );
		q.position.copy( cab ).addScaledVector( d, 0.5 ); q.position.y -= 0.15; q.visible = true;
		lanzar( q, d.multiplyScalar( 13 ).add( new THREE.Vector3( 0, 2.5, 0 ) ) );
	}
	function aturdir( z, empujon = false, dirEmpuje = null ) {
		const u = z.userData;
		if ( u.aturdido > 0 ) return false;
		if ( empujon ) {                                    // manotazo: sale disparado hacia atrás y tropieza
			if ( u.calma > 0 ) return false;
			z.position.addScaledVector( dirEmpuje.setY( 0 ).normalize(), 2.3 ); ctx.limitar( z.position );
			u.estado = 'tropiezo'; u.tropiezo = Math.min( clips.tambalear?.duration ?? 2, 2.4 ); u.impulso.copy( dirEmpuje ); u.calma = 2;
			animar( z, 'tambalear', 0.1 ); sonar( 'grunido', 0.8, z );
			J.empujones ++; sumar( PUNTOS.empujon );
			aviso( '✋ ¡Empujón! +50', '#38bdf8', 1300 );
			return true;
		}
		u.aturdido = T_ATURDIDO; u.estado = 'aturdido'; u.tropiezo = 0;
		animar( z, 'morir', 0.15 ); sonar( 'dano', 0.7, z ); sonar( 'grunido', 0.9, z );
		particulas( z.position.clone().setY( 1.2 ), 0x9cff4a );
		J.aturdidos ++; sumar( PUNTOS.aturdir );
		aviso( '💥 ¡Zombie aturdido! +75', '#9cff4a', 1400 );
		return true;
	}
	function empujarPC() {                               // PC: empuja a los zombies que están enfrente (Q)
		const d = new THREE.Vector3(); camera.getWorldDirection( d ); d.y = 0; d.normalize(); camera.getWorldPosition( cab );
		let alguno = false;
		zombies.forEach( ( z ) => {
			const v = z.position.clone().sub( cab ).setY( 0 ), dist = v.length();
			if ( dist < 1.9 && v.normalize().dot( d ) > 0.5 ) alguno = aturdir( z, true, d.clone() ) || alguno;
		} );
		ctx.sacudir?.( 0.12 );
		if ( ! alguno ) aviso( '✋ No hay ningún zombie al alcance', '#9aa3c7', 900 );
	}
	const tmpMano = new THREE.Vector3();
	function actualizarManos( dt ) {
		// proyectiles en el aire
		podridas.forEach( ( q ) => {
			const u = q.userData;
			if ( u.estado !== 'aire' ) return;
			u.vida += dt;
			u.vel.y -= 9.8 * dt;
			q.position.addScaledVector( u.vel, dt );
			q.rotation.x += u.giro.x * dt; q.rotation.y += u.giro.y * dt; q.rotation.z += u.giro.z * dt;
			// ¿golpeó a un zombie?
			for ( const z of zombies ) {
				if ( z.userData.aturdido > 0 ) continue;
				if ( Math.hypot( q.position.x - z.position.x, q.position.z - z.position.z ) < 0.55 && q.position.y < 1.9 ) {
					aturdir( z ); ctx.vibrar?.( 'right', 0.8, 90 );
					u.vel.multiplyScalar( -0.2 ); u.estado = 'suelo_pronto';
					break;
				}
			}
			if ( q.position.y <= 0.16 ) {                    // rebote en el piso
				q.position.y = 0.16; u.vel.y *= -0.35; u.vel.x *= 0.6; u.vel.z *= 0.6;
				if ( Math.abs( u.vel.y ) < 0.6 ) u.estado = 'rodando';
			}
			if ( Math.hypot( q.position.x, q.position.z ) > ctx.LIMITE + 4 || u.vida > 8 ) u.estado = 'rodando';
		} );
		podridas.forEach( ( q ) => {
			const u = q.userData;
			if ( u.estado === 'suelo_pronto' ) { u.vel.y -= 9.8 * dt; q.position.addScaledVector( u.vel, dt ); if ( q.position.y <= 0.16 ) { q.position.y = 0.16; u.estado = 'rodando'; } }
			if ( u.estado === 'rodando' ) {
				u.vida += dt; q.position.addScaledVector( u.vel.setY( 0 ), dt ); u.vel.multiplyScalar( Math.max( 0, 1 - dt * 3 ) );
				ctx.limitar( q.position, 0.3 );
				if ( u.vel.length() < 0.15 ) { u.estado = 'suelo'; q.rotation.set( 0, q.rotation.y, 0 ); q.position.y = 0.16;
					if ( ctx.colliders.some( ( o ) => Math.hypot( q.position.x - o.x, q.position.z - o.z ) < o.r + 0.2 ) ) colocarPodrida( q ); }
			}
		} );
		// manos en VR: indicador de agarre + empujones
		anilloMano.visible = false;
		for ( const c of ctx.mandos ?? [] ) {
			const u = c.userData; if ( ! u.mano || ! renderer().xr.isPresenting ) continue;
			if ( ! u.grip.userData.sostiene ) {
				const q = podridas.find( ( q ) => q.visible && q.userData.estado === 'suelo' && Math.hypot( u.pos.x - q.position.x, u.pos.z - q.position.z ) < 0.6 && u.pos.y - q.position.y < 1.1 );
				if ( q ) { anilloMano.visible = true; anilloMano.position.set( q.position.x, 0.03, q.position.z ); anilloMano.scale.setScalar( 1 + Math.sin( performance.now() / 120 ) * 0.08 ); }
			}
			const rapidez = u.vel.length();
			if ( rapidez > VEL_EMPUJON ) {
				for ( const z of zombies ) {
					if ( z.userData.aturdido > 0 ) continue;
					tmpMano.set( u.pos.x - z.position.x, 0, u.pos.z - z.position.z );
					if ( tmpMano.length() < 0.75 && u.pos.y > 0.5 && u.pos.y < 2.1 ) {
						if ( aturdir( z, true, u.vel.clone() ) ) { ctx.vibrar?.( u.mano, 1, 120 ); ctx.sacudir?.( 0.1 ); }
					}
				}
			}
		}
	}
	const renderer = () => ctx.renderer;

	// =================== PARTÍCULAS ===================
	const sistemas = [];
	const puntoTex = ( () => { const c = document.createElement( 'canvas' ); c.width = c.height = 64; const g = c.getContext( '2d' ); const r = g.createRadialGradient( 32, 32, 2, 32, 32, 32 ); r.addColorStop( 0, '#fff' ); r.addColorStop( 0.4, 'rgba(255,255,255,.6)' ); r.addColorStop( 1, 'rgba(255,255,255,0)' ); g.fillStyle = r; g.fillRect( 0, 0, 64, 64 ); return new THREE.CanvasTexture( c ); } )();
	function particulas( pos, color = 0xffa040 ) {
		const N = 160, geo = new THREE.BufferGeometry(), p = new Float32Array( N * 3 ), v = [];
		for ( let i = 0; i < N; i ++ ) { p.set( [ pos.x, pos.y, pos.z ], i * 3 ); v.push( new THREE.Vector3( Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5 ).normalize().multiplyScalar( 2 + Math.random() * 3 ) ); }
		geo.setAttribute( 'position', new THREE.BufferAttribute( p, 3 ) );
		const pts = new THREE.Points( geo, new THREE.PointsMaterial( { color, size: 0.09, map: puntoTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } ) );
		pts.userData = { v, edad: 0 }; scene.add( pts ); sistemas.push( pts );
	}

	// =================== CICLO ===================
	const cab = new THREE.Vector3(), dir = new THREE.Vector3();
	ctx.actualizarJuego = ( dt, t ) => {
		calabazas.forEach( ( c ) => { if ( c.visible ) { c.rotation.y += dt * 0.6; c.userData.mat.emissiveIntensity = 0.75 + Math.sin( t * 6 + c.userData.fase ) * 0.25; } } );
		if ( dorada.visible ) { dorada.rotation.y += dt * 2; dorada.position.y = 0.15 + Math.sin( t * 3 ) * 0.12; }
		for ( let i = sistemas.length - 1; i >= 0; i -- ) {
			const s = sistemas[ i ], a = s.geometry.attributes.position; s.userData.edad += dt;
			s.userData.v.forEach( ( v, k ) => { v.y -= 6 * dt; a.array[ k * 3 ] += v.x * dt; a.array[ k * 3 + 1 ] += v.y * dt; a.array[ k * 3 + 2 ] += v.z * dt; } );
			a.needsUpdate = true; s.material.opacity = 1 - s.userData.edad / 1.4;
			if ( s.userData.edad > 1.4 ) { scene.remove( s ); s.geometry.dispose(); sistemas.splice( i, 1 ); }
		}
		zombies.forEach( ( z ) => z.userData.mixer?.update( dt ) );
		if ( avisoHasta && performance.now() > avisoHasta ) { avisoHasta = 0; dibujarPanel(); }
		if ( ! J.activo ) return;

		J.tiempo += dt; J.invulnerable = Math.max( 0, J.invulnerable - dt );
		camera.getWorldPosition( cab );

		// recoger calabazas al tocarlas caminando
		calabazas.forEach( ( c ) => { if ( c.visible && Math.hypot( cab.x - c.position.x, cab.z - c.position.z ) < 0.75 ) recoger( c ); } );
		if ( dorada.visible && Math.hypot( cab.x - dorada.position.x, cab.z - dorada.position.z ) < 0.8 ) recogerDorada();

		// calabaza dorada (una por nivel)
		if ( J.doradaEn > 0 ) { J.doradaEn -= dt; if ( J.doradaEn <= 0 ) { dorada.position.copy( lugarLibre( 6, ctx.LIMITE - 3 ) ); dorada.visible = true; aviso( '✨ Apareció una calabaza dorada', '#ffc94d' ); } }

		actualizarManos( dt );

		// dificultad progresiva según las calabazas recogidas
		const P = progreso( J );
		// un zombie nuevo sale de su tumba cada cierto tiempo (cada vez más seguido)
		J.oleada += dt;
		if ( J.oleada > P.oleadaCada && zombies.length < MAX_ZOMBIES ) {
			J.oleada = 0;
			const z = agregarZombie( false ); z.userData.espera = 2; sonar( 'grunido', 1, z );
			aviso( '🧟 ¡Un zombie salió de su tumba!', '#ff4d6d' );
		}

		const dificultad = P.vel;
		let masCerca = Infinity;
		zombies.forEach( ( z ) => {
			const u = z.userData;
			u.calma = Math.max( 0, u.calma - dt );
			if ( u.espera > 0 ) { u.espera -= dt; animar( z, 'quieto' ); return; }
			if ( u.aturdido > 0 ) {                          // en el suelo tras un calabazazo
				u.aturdido -= dt;
				if ( u.aturdido <= 0 ) { u.espera = 0.8; u.estado = 'deambular'; u.calma = 1.5; }
				return;
			}
			const dist = Math.hypot( cab.x - z.position.x, cab.z - z.position.z );
			masCerca = Math.min( masCerca, dist );
			let vel;
			if ( u.tropiezo > 0 ) {                           // ¡lo esquivaste! pierde el equilibrio
				u.tropiezo -= dt;
				dir.copy( u.impulso );
				vel = VEL_DEAMBULAR * 0.6 * Math.max( 0, u.tropiezo / 2 );   // sigue de frente por el impulso y frena
				if ( u.tropiezo <= 0 ) { u.estado = 'deambular'; u.cerca = false; }
			} else if ( dist < P.vision ) {                // ¡te vio! te persigue
				if ( u.estado !== 'perseguir' ) { u.estado = 'perseguir'; sonar( 'grunido', 0.8, z ); }
				// gira hacia ti, pero con un límite de velocidad de giro
				const haciaTi = Math.atan2( cab.x - z.position.x, cab.z - z.position.z );
				const dif = Math.atan2( Math.sin( haciaTi - u.rumbo ), Math.cos( haciaTi - u.rumbo ) );
				u.rumbo += THREE.MathUtils.clamp( dif, -P.giro * dt, P.giro * dt );
				dir.set( Math.sin( u.rumbo ), 0, Math.cos( u.rumbo ) );
				vel = VEL_PERSEGUIR * dificultad;
				animar( z, 'caminar', 0.3, 1.5 * dificultad );   // camina más rápido al perseguir
				if ( dist < RADIO_ATAQUE && Math.abs( dif ) < 1.2 ) { herir( z ); u.cerca = false; }
				else if ( dist < 2.5 ) u.cerca = true;
				// ESQUIVE: pasaste a su lado (no alcanza a voltear) o te alejaste después de que casi te atrapa
				const meRebaso = dist < 2.5 && Math.abs( dif ) > ANGULO_ESQUIVE;
				const meEscape = u.cerca && dist > 3;
				if ( ( meRebaso || meEscape ) && u.calma <= 0 && J.invulnerable <= 0 ) {
					u.cerca = false; u.estado = 'tropiezo'; u.calma = 4;
					u.impulso.copy( dir );
					u.tropiezo = Math.min( clips.tambalear?.duration ?? 2, 2.6 );
					animar( z, 'tambalear', 0.15 ); sonar( 'grunido', 0.6, z );
					ctx.vibrar?.( 'left', 0.25, 50 );
					J.esquives ++; sumar( PUNTOS.esquive );
					aviso( '💫 ¡Esquive! +50', '#38bdf8', 1400 );
					return;
				}
			} else {                                          // deambula entre las lápidas
				u.estado = 'deambular'; u.cerca = false;
				if ( z.position.distanceTo( u.destino ) < 1 ) u.destino.copy( lugarLibre( 3, ctx.LIMITE - 2 ) );
				dir.copy( u.destino ).sub( z.position ).setY( 0 ).normalize();
				u.rumbo = Math.atan2( dir.x, dir.z );
				vel = VEL_DEAMBULAR; animar( z, 'caminar', 0.35, 1 );
			}
			z.position.addScaledVector( dir, vel * dt );
			for ( const o of ctx.colliders ) {                 // rodea obstáculos
				const ex = z.position.x - o.x, ez = z.position.z - o.z, d = Math.hypot( ex, ez ), min = o.r + 0.35;
				if ( d < min ) { z.position.x += ( ex / ( d || 1 ) ) * ( min - d ); z.position.z += ( ez / ( d || 1 ) ) * ( min - d ); }
			}
			ctx.limitar( z.position );
			const objetivoRot = Math.atan2( dir.x, dir.z );
			z.rotation.y += Math.atan2( Math.sin( objetivoRot - z.rotation.y ), Math.cos( objetivoRot - z.rotation.y ) ) * Math.min( 1, dt * 5 );
		} );
		// latido: más fuerte y rápido cuanto más cerca está un zombie
		if ( latido.buffer ) {
			const k = A.latidos ? THREE.MathUtils.clamp( 1 - ( masCerca - 1 ) / 10, 0, 1 ) : 0;
			latido.setVolume( k * 0.9 * volEf() );
			if ( latido.source ) latido.source.playbackRate.value = 1 + k * 0.8;
		}
		if ( Math.floor( J.tiempo * 4 ) !== Math.floor( ( J.tiempo - dt ) * 4 ) ) actualizarMarcador();
	};

	// radar (solo PC)
	const fwd = new THREE.Vector3();
	ctx.actualizarRadar = ( dt ) => {
		if ( ! A.radar ) return;
		camera.getWorldPosition( cab ); camera.getWorldDirection( fwd );
		ctx.ui?.radar( cab, Math.atan2( -fwd.x, -fwd.z ), zombies, calabazas, dorada, dt, podridas );
	};

	ctx.juego = {
		get activo() { return J.activo; }, get fin() { return J.fin; }, get estado() { return J; },
		reiniciar, agarrar, soltar, lanzarPC, empujarPC, iniciarAudio,
		pausarAudio: () => listener.context.suspend(),
		reanudarAudio: () => listener.context.resume(),
		detener: () => { J.activo = false; J.fin = false; zombies.forEach( ( z ) => scene.remove( z ) ); zombies.length = 0; calabazas.forEach( ( c ) => { c.visible = false; } ); dorada.visible = false; podridas.forEach( ( p ) => { p.userData.mano?.remove?.( p ); if ( p.userData.mano ) p.userData.mano.userData.sostiene = null; scene.add( p ); p.userData.mano = null; p.visible = false; p.userData.estado = 'oculta'; } ); latido.setVolume( 0 ); },
		mostrarPanelVR: ( v ) => { panel.visible = v; }
	};
}

function caraCalabaza() {
	const S = 256, c = document.createElement( 'canvas' ); c.width = c.height = S;
	const g = c.getContext( '2d' ); g.fillStyle = '#000'; g.fillRect( 0, 0, S, S ); g.fillStyle = '#ffd18a';
	const tri = ( x, y, w, h ) => { g.beginPath(); g.moveTo( x, y - h / 2 ); g.lineTo( x - w / 2, y + h / 2 ); g.lineTo( x + w / 2, y + h / 2 ); g.fill(); };
	// la cara se repite 2 veces alrededor de la esfera
	[ 0.25, 0.75 ].forEach( ( cx ) => {
		tri( S * ( cx - 0.07 ), S * 0.42, S * 0.07, S * 0.1 ); tri( S * ( cx + 0.07 ), S * 0.42, S * 0.07, S * 0.1 );
		g.beginPath(); g.moveTo( S * ( cx - 0.12 ), S * 0.58 );
		for ( let i = 1; i <= 6; i ++ ) g.lineTo( S * ( cx - 0.12 + i * 0.04 ), S * ( i % 2 ? 0.66 : 0.6 ) );
		g.lineTo( S * ( cx + 0.12 ), S * 0.58 ); g.fill();
	} );
	return new THREE.CanvasTexture( c );
}
