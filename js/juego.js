// =============================================================
// juego.js  ·  Responsable: Eduardo Martínez Trujillo
// Reglas del juego, zombies (FBX de Mixamo), calabazas, vidas,
// música de fondo, efectos de sonido y marcador (PC + VR).
// =============================================================
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const N_CALABAZAS = 12, N_ZOMBIES = 5, VIDAS = 3;
const RADIO_VISION = 9, RADIO_ATAQUE = 0.9;
const VEL_DEAMBULAR = 0.55, VEL_PERSEGUIR = 1.25;

export function crearJuego( ctx ) {
	const { scene, camera, player, manager } = ctx;

	// =================== SONIDO ===================
	const listener = new THREE.AudioListener();
	camera.add( listener );
	const cargarAudio = new THREE.AudioLoader( manager );
	const buffers = {};
	[ 'recoger', 'grunido', 'dano', 'victoria', 'derrota' ].forEach( ( n ) =>
		cargarAudio.load( `assets/audio/sfx_${n}.mp3`, ( b ) => { buffers[ n ] = b; } ) );

	const musica = new THREE.Audio( listener );
	const viento = new THREE.Audio( listener );
	// música de la 3.4/3.5; si no está, se usa el ambiente del ejemplo
	cargarAudio.load( 'assets/audio/zombie_dance.mp3', ( b ) => { musica.setBuffer( b ); },
		undefined, () => cargarAudio.load( 'assets/audio/forest_night.mp3', ( b ) => musica.setBuffer( b ) ) );
	cargarAudio.load( 'assets/audio/wind.mp3', ( b ) => viento.setBuffer( b ) );

	function sonar( nombre, volumen = 0.9, objeto = null ) {
		if ( ! buffers[ nombre ] ) return;
		const s = objeto ? new THREE.PositionalAudio( listener ) : new THREE.Audio( listener );
		s.setBuffer( buffers[ nombre ] ); s.setVolume( volumen );
		if ( objeto ) { s.setRefDistance( 2 ); objeto.add( s ); s.onEnded = () => { s.isPlaying = false; objeto.remove( s ); }; }
		s.play();
	}
	function iniciarAudio() {
		if ( listener.context.state === 'suspended' ) listener.context.resume();
		if ( musica.buffer && ! musica.isPlaying ) { musica.setLoop( true ); musica.setVolume( 0.35 ); musica.play(); }
		if ( viento.buffer && ! viento.isPlaying ) { viento.setLoop( true ); viento.setVolume( 0.18 ); viento.play(); }
	}

	// =================== CALABAZAS ===================
	const calabazas = [];
	const caraTex = caraCalabaza();
	for ( let i = 0; i < N_CALABAZAS; i ++ ) {
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
		z.userData = { mixer, acciones: {}, actual: null, estado: 'deambular', destino: new THREE.Vector3(), espera: 0, gruño: false };
		scene.add( z );
		return z;
	}
	function animar( z, nombre, fundido = 0.35 ) {
		const u = z.userData; if ( ! u.mixer || ! clips[ nombre ] ) return;
		let a = u.acciones[ nombre ];
		if ( ! a ) {
			a = u.acciones[ nombre ] = u.mixer.clipAction( clips[ nombre ] );
			if ( nombre === 'morir' ) { a.setLoop( THREE.LoopOnce, 1 ); a.clampWhenFinished = true; }
		}
		if ( u.actual === a ) return;
		a.reset().setEffectiveTimeScale( 1 ).fadeIn( fundido ).play();
		if ( u.actual ) u.actual.fadeOut( fundido );
		u.actual = a;
	}

	// =================== MARCADOR ===================
	const hud = { cal: document.getElementById( 'hudCalabazas' ), vid: document.getElementById( 'hudVidas' ), tie: document.getElementById( 'hudTiempo' ) };
	const msg = document.getElementById( 'mensaje' ), flash = document.getElementById( 'flash' );
	// panel flotante dentro del VR (pegado a la vista)
	const lienzo = document.createElement( 'canvas' ); lienzo.width = 512; lienzo.height = 160;
	const texPanel = new THREE.CanvasTexture( lienzo ); texPanel.colorSpace = THREE.SRGBColorSpace;
	const panel = new THREE.Mesh( new THREE.PlaneGeometry( 0.48, 0.15 ), new THREE.MeshBasicMaterial( { map: texPanel, transparent: true, depthTest: false, fog: false } ) );
	panel.position.set( 0, -0.32, -0.9 ); panel.rotation.x = -0.35; panel.renderOrder = 10; panel.visible = false;
	camera.add( panel );
	let textoGrande = '';
	function dibujarPanel() {
		const g = lienzo.getContext( '2d' );
		g.clearRect( 0, 0, 512, 160 );
		g.fillStyle = 'rgba(8,12,8,0.75)'; g.strokeStyle = '#8be04e'; g.lineWidth = 4;
		g.beginPath(); g.roundRect( 4, 4, 504, 152, 22 ); g.fill(); g.stroke();
		g.fillStyle = '#e8f5e0'; g.font = 'bold 40px Arial'; g.textAlign = 'center';
		if ( textoGrande ) { g.fillStyle = '#8be04e'; g.fillText( textoGrande, 256, 70 ); g.font = '26px Arial'; g.fillStyle = '#e8f5e0'; g.fillText( 'Botón A para jugar otra vez', 256, 120 ); }
		else g.fillText( `🎃 ${J.recogidas}/${N_CALABAZAS}    ❤️ ${J.vidas}    ⏱ ${formato( J.tiempo )}`, 256, 95 );
		texPanel.needsUpdate = true;
	}
	function actualizarMarcador() {
		hud.cal.textContent = `${J.recogidas} / ${N_CALABAZAS}`;
		hud.vid.textContent = String( J.vidas );
		hud.tie.textContent = formato( J.tiempo );
		dibujarPanel();
	}
	function mostrarMensaje( titulo, sub ) {
		textoGrande = titulo;
		msg.innerHTML = `${titulo}<small>${sub}</small>`; msg.style.display = titulo ? 'block' : 'none';
		dibujarPanel();
	}

	// =================== REGLAS ===================
	const J = { activo: false, vidas: VIDAS, recogidas: 0, tiempo: 0, invulnerable: 0, fin: false };

	function lugarLibre( rMin, rMax ) {
		for ( let n = 0; n < 60; n ++ ) {
			const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * ( rMax - rMin );
			const x = Math.cos( a ) * r, z = Math.sin( a ) * r;
			if ( ctx.colliders.every( ( o ) => Math.hypot( x - o.x, z - o.z ) > o.r + 0.8 ) ) return new THREE.Vector3( x, 0, z );
		}
		return new THREE.Vector3( rMin, 0, 0 );
	}

	function reiniciar() {
		Object.assign( J, { activo: true, vidas: VIDAS, recogidas: 0, tiempo: 0, invulnerable: 2, fin: false } );
		mostrarMensaje( '', '' );
		calabazas.forEach( ( c ) => { c.visible = true; c.userData.recogida = false; c.position.copy( lugarLibre( 5, ctx.LIMITE - 3 ) ); } );
		zombies.forEach( ( z ) => scene.remove( z ) ); zombies.length = 0;
		for ( let i = 0; i < N_ZOMBIES; i ++ ) {
			const z = crearZombie(); z.position.copy( lugarLibre( 14, ctx.LIMITE - 2 ) );
			z.userData.destino.copy( lugarLibre( 4, ctx.LIMITE - 2 ) ); animar( z, 'caminar' ); zombies.push( z );
		}
		player.position.set( 0, 0, 0 );
		iniciarAudio(); actualizarMarcador();
	}

	function recoger( c ) {
		if ( c.userData.recogida || ! J.activo ) return;
		c.userData.recogida = true; c.visible = false; J.recogidas ++;
		sonar( 'recoger', 0.9 ); ctx.vibrar?.( 'right', 0.4, 60 ); ctx.vibrar?.( 'left', 0.4, 60 );
		particulas( c.position.clone().setY( 0.4 ) );
		actualizarMarcador();
		if ( J.recogidas >= N_CALABAZAS ) terminar( true );
	}
	function agarrar( origen ) {          // grip del mando (o tecla E en PC)
		const p = new THREE.Vector3(); origen.getWorldPosition( p );
		const alcance = origen === camera ? 2.2 : 1.0;
		calabazas.forEach( ( c ) => { if ( c.visible && Math.hypot( p.x - c.position.x, p.z - c.position.z ) < alcance ) recoger( c ); } );
	}
	function herir( z ) {
		if ( J.invulnerable > 0 || ! J.activo ) return;
		J.vidas --; J.invulnerable = 2.2;
		sonar( 'dano', 1 ); sonar( 'grunido', 1, z );
		ctx.vibrar?.( 'left', 1, 250 ); ctx.vibrar?.( 'right', 1, 250 );
		flash.style.opacity = 1; setTimeout( () => { flash.style.opacity = 0; }, 350 );
		// el zombie retrocede
		const cab = new THREE.Vector3(); camera.getWorldPosition( cab );
		const atras = z.position.clone().sub( cab ).setY( 0 ).normalize().multiplyScalar( 3 );
		z.position.add( atras ); ctx.limitar( z.position ); z.userData.espera = 1.5;
		actualizarMarcador();
		if ( J.vidas <= 0 ) terminar( false );
	}
	function terminar( gano ) {
		J.activo = false; J.fin = true;
		sonar( gano ? 'victoria' : 'derrota', 1 );
		// si ganas, los zombies caen; si pierdes, ¡celebran bailando!
		zombies.forEach( ( z ) => animar( z, gano ? 'morir' : 'bailar' ) );
		mostrarMensaje( gano ? '¡Sobreviviste! 🎃' : '¡Te atraparon! 🧟', `Tiempo: ${formato( J.tiempo )} · ${gano ? 'Botón A / R para jugar otra vez' : 'Botón A / R para intentarlo de nuevo'}` );
	}

	// =================== PARTÍCULAS ===================
	const sistemas = [];
	function particulas( pos ) {
		const N = 160, geo = new THREE.BufferGeometry(), p = new Float32Array( N * 3 ), v = [];
		for ( let i = 0; i < N; i ++ ) { p.set( [ pos.x, pos.y, pos.z ], i * 3 ); v.push( new THREE.Vector3( Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5 ).normalize().multiplyScalar( 2 + Math.random() * 3 ) ); }
		geo.setAttribute( 'position', new THREE.BufferAttribute( p, 3 ) );
		const pts = new THREE.Points( geo, new THREE.PointsMaterial( { color: 0xffa040, size: 0.07, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } ) );
		pts.userData = { v, edad: 0 }; scene.add( pts ); sistemas.push( pts );
	}

	// =================== CICLO ===================
	const cab = new THREE.Vector3(), dir = new THREE.Vector3();
	ctx.actualizarJuego = ( dt, t ) => {
		calabazas.forEach( ( c ) => { if ( c.visible ) { c.rotation.y += dt * 0.6; c.userData.mat.emissiveIntensity = 0.75 + Math.sin( t * 6 + c.userData.fase ) * 0.25; } } );
		for ( let i = sistemas.length - 1; i >= 0; i -- ) {
			const s = sistemas[ i ], a = s.geometry.attributes.position; s.userData.edad += dt;
			s.userData.v.forEach( ( v, k ) => { v.y -= 6 * dt; a.array[ k * 3 ] += v.x * dt; a.array[ k * 3 + 1 ] += v.y * dt; a.array[ k * 3 + 2 ] += v.z * dt; } );
			a.needsUpdate = true; s.material.opacity = 1 - s.userData.edad / 1.4;
			if ( s.userData.edad > 1.4 ) { scene.remove( s ); s.geometry.dispose(); sistemas.splice( i, 1 ); }
		}
		zombies.forEach( ( z ) => z.userData.mixer?.update( dt ) );
		if ( ! J.activo ) return;

		J.tiempo += dt; J.invulnerable = Math.max( 0, J.invulnerable - dt );
		camera.getWorldPosition( cab );

		// recoger calabazas al tocarlas caminando
		calabazas.forEach( ( c ) => { if ( c.visible && Math.hypot( cab.x - c.position.x, cab.z - c.position.z ) < 0.75 ) recoger( c ); } );

		const dificultad = 1 + J.recogidas * 0.06;
		zombies.forEach( ( z ) => {
			const u = z.userData;
			if ( u.espera > 0 ) { u.espera -= dt; animar( z, 'quieto' ); return; }
			const dist = Math.hypot( cab.x - z.position.x, cab.z - z.position.z );
			let vel;
			if ( dist < RADIO_VISION ) {                       // ¡te vio! te persigue
				if ( u.estado !== 'perseguir' ) { u.estado = 'perseguir'; sonar( 'grunido', 0.8, z ); }
				dir.set( cab.x - z.position.x, 0, cab.z - z.position.z ).normalize();
				vel = VEL_PERSEGUIR * dificultad; animar( z, 'tambalear' );
				if ( dist < RADIO_ATAQUE ) herir( z );
			} else {                                          // deambula entre las lápidas
				u.estado = 'deambular';
				if ( z.position.distanceTo( u.destino ) < 1 ) u.destino.copy( lugarLibre( 3, ctx.LIMITE - 2 ) );
				dir.copy( u.destino ).sub( z.position ).setY( 0 ).normalize();
				vel = VEL_DEAMBULAR; animar( z, 'caminar' );
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
		if ( Math.floor( J.tiempo * 4 ) !== Math.floor( ( J.tiempo - dt ) * 4 ) ) actualizarMarcador();
	};

	ctx.juego = {
		get activo() { return J.activo; }, reiniciar, agarrar, iniciarAudio,
		mostrarPanelVR: ( v ) => { panel.visible = v; }
	};
}

function formato( s ) { const m = Math.floor( s / 60 ), r = Math.floor( s % 60 ); return `${m}:${String( r ).padStart( 2, '0' )}`; }

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
