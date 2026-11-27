// =============================================================
// controles.js  ·  Responsable: Gamaliel Jiménez Oropeza
// Visión en 1ª persona y los 2 controles de mando de Meta Quest 3:
//   · Stick izquierdo  → caminar (dirección de la mirada)
//   · Stick derecho    → giro por pasos de 30°
//   · Gatillo derecho  → arco de teletransporte (soltar para saltar)
//   · Gatillo izquierdo→ linterna on/off
//   · Grip (ambos)     → agarrar calabaza cercana
//   · Botón A          → reiniciar partida
// + modo PC (WASD + ratón) para probar sin gafas.
// =============================================================
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const VEL_CAMINAR = 2.4, VEL_CORRER = 4.2, RADIO_JUGADOR = 0.35;

export function crearControles( ctx ) {
	const { renderer, scene, camera, player } = ctx;

	const A = ctx.ajustes;
	// ---------- Botón ENTER VR (se coloca en el menú principal) ----------
	const vrBtn = VRButton.createButton( renderer, { optionalFeatures: [ 'local-floor', 'bounded-floor' ] } );
	document.getElementById( 'vrSlotHero' ).appendChild( vrBtn );

	// ---------- Controles y sus modelos 3D ----------
	const fabrica = new XRControllerModelFactory();
	const mandos = [ 0, 1 ].map( ( i ) => {
		const c = renderer.xr.getController( i );
		const grip = renderer.xr.getControllerGrip( i );
		grip.add( fabrica.createControllerModel( grip ) );
		player.add( c, grip );
		c.userData.grip = grip;
		c.userData.pos = new THREE.Vector3(); c.userData.prev = new THREE.Vector3(); c.userData.vel = new THREE.Vector3();
		c.addEventListener( 'connected', ( e ) => { c.userData.mano = e.data.handedness; c.userData.gamepad = e.data.gamepad; } );
		c.addEventListener( 'disconnected', () => { c.userData.mano = null; } );
		return c;
	} );
	const mando = ( mano ) => mandos.find( ( c ) => c.userData.mano === mano );

	// ---------- Linterna en la mano izquierda (o en la cámara en PC) ----------
	const linterna = new THREE.SpotLight( 0xfff2d0, 0, 22, Math.PI / 7, 0.45, 1.2 );
	linterna.position.set( 0, 0, 0 );
	const objetivo = new THREE.Object3D(); objetivo.position.set( 0, 0, -1 );
	linterna.target = objetivo;
	camera.add( linterna, objetivo );
	ctx.linterna = { encendida: false };
	function alternarLinterna() {
		ctx.linterna.encendida = ! ctx.linterna.encendida;
		linterna.intensity = ctx.linterna.encendida ? 30 : 0;
		vibrar( 'left', 0.3, 40 );
	}
	function colocarLinterna() {
		const izq = mando( 'left' );
		const padre = renderer.xr.isPresenting && izq ? izq : camera;
		if ( linterna.parent !== padre ) { padre.add( linterna, objetivo ); }
	}

	// ---------- Arco de teletransporte ----------
	const PASOS = 40;
	const arcoGeo = new THREE.BufferGeometry().setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( PASOS * 3 ), 3 ) );
	const arco = new THREE.Line( arcoGeo, new THREE.LineBasicMaterial( { color: 0x8be04e } ) );
	arco.frustumCulled = false; arco.visible = false; scene.add( arco );
	const marca = new THREE.Mesh( new THREE.RingGeometry( 0.25, 0.32, 32 ), new THREE.MeshBasicMaterial( { color: 0x8be04e, side: THREE.DoubleSide } ) );
	marca.rotation.x = -Math.PI / 2; marca.visible = false; scene.add( marca );
	let destinoValido = false; const destino = new THREE.Vector3();

	mandos.forEach( ( c ) => {
		c.addEventListener( 'selectstart', () => {
			if ( ctx.estado === 'pausa' ) { menuVR.seleccionar( c ); return; }
			if ( ctx.estado !== 'jugando' ) return;
			if ( c.userData.mano === 'right' ) { arco.visible = marca.visible = true; c.userData.apuntando = true; }
			if ( c.userData.mano === 'left' ) alternarLinterna();
		} );
		c.addEventListener( 'selectend', () => {
			if ( c.userData.mano !== 'right' ) return;
			c.userData.apuntando = false; arco.visible = marca.visible = false;
			if ( destinoValido && ctx.juego?.activo ) {
				// mover el "player" para que la cabeza quede sobre el destino
				const cabeza = new THREE.Vector3(); camera.getWorldPosition( cabeza );
				player.position.x += destino.x - cabeza.x;
				player.position.z += destino.z - cabeza.z;
				vibrar( 'right', 0.5, 60 );
			}
		} );
		c.addEventListener( 'squeezestart', () => { if ( ctx.estado === 'jugando' ) ctx.juego?.agarrar( c ); } );
		c.addEventListener( 'squeezeend', () => { if ( ctx.estado === 'jugando' ) ctx.juego?.soltar( c ); } );
	} );

	function actualizarArco() {
		const der = mando( 'right' );
		if ( ! der || ! der.userData.apuntando ) return;
		const o = new THREE.Vector3().setFromMatrixPosition( der.matrixWorld );
		const v = new THREE.Vector3( 0, 0, -1 ).transformDirection( der.matrixWorld ).multiplyScalar( 8 );
		const pts = arcoGeo.attributes.position.array;
		let p = o.clone(), choque = null;
		for ( let i = 0; i < PASOS; i ++ ) {
			pts[ i * 3 ] = p.x; pts[ i * 3 + 1 ] = p.y; pts[ i * 3 + 2 ] = p.z;
			if ( ! choque ) {
				v.y -= 9.8 / 45;
				const sig = p.clone().addScaledVector( v, 1 / 45 );
				if ( sig.y <= 0 ) { choque = p.clone().lerp( sig, p.y / ( p.y - sig.y ) ); choque.y = 0; p = choque.clone(); }
				else p = sig;
			}
		}
		arcoGeo.attributes.position.needsUpdate = true;
		destinoValido = !! choque && Math.hypot( choque.x, choque.z ) < ctx.LIMITE - 0.5 && ! chocaConObstaculo( choque );
		const color = destinoValido ? 0x8be04e : 0xff4a4a;
		arco.material.color.set( color ); marca.material.color.set( color );
		if ( choque ) { destino.copy( choque ); marca.position.set( choque.x, 0.02, choque.z ); }
	}

	function chocaConObstaculo( p ) {
		return ctx.colliders.some( ( o ) => Math.hypot( p.x - o.x, p.z - o.z ) < o.r + RADIO_JUGADOR );
	}

	// ---------- Movimiento con colisiones ----------
	const cabezaTmp = new THREE.Vector3();
	function mover( dx, dz ) {
		camera.getWorldPosition( cabezaTmp );
		const sig = new THREE.Vector3( cabezaTmp.x + dx, 0, cabezaTmp.z + dz );
		for ( const o of ctx.colliders ) {
			const ex = sig.x - o.x, ez = sig.z - o.z, d = Math.hypot( ex, ez ), min = o.r + RADIO_JUGADOR;
			if ( d < min ) { sig.x += ( ex / ( d || 1 ) ) * ( min - d ); sig.z += ( ez / ( d || 1 ) ) * ( min - d ); }
		}
		ctx.limitar( sig );
		player.position.x += sig.x - cabezaTmp.x;
		player.position.z += sig.z - cabezaTmp.z;
	}

	// ---------- Vibración (háptica) ----------
	function vibrar( mano, fuerza = 0.6, ms = 80 ) {
		const c = mando( mano ); const act = c?.userData.gamepad?.hapticActuators?.[ 0 ];
		if ( act?.pulse ) act.pulse( fuerza, ms );
		else c?.userData.gamepad?.vibrationActuator?.playEffect?.( 'dual-rumble', { duration: ms, strongMagnitude: fuerza } );
	}
	ctx.vibrar = vibrar;

	// ---------- Lectura de sticks y botones VR ----------
	let giroListo = true, botonA = false;
	function actualizarVR( dt ) {
		for ( const c of mandos ) {
			const gp = c.userData.gamepad; if ( ! gp ) continue;
			const ax = gp.axes[ 2 ] ?? gp.axes[ 0 ] ?? 0, ay = gp.axes[ 3 ] ?? gp.axes[ 1 ] ?? 0;
			if ( c.userData.mano === 'left' && ctx.juego?.activo && ctx.estado === 'jugando' ) {
				const x = Math.abs( ax ) > 0.15 ? ax : 0, y = Math.abs( ay ) > 0.15 ? ay : 0;
				if ( x || y ) {
					const fwd = new THREE.Vector3(); camera.getWorldDirection( fwd ); fwd.y = 0; fwd.normalize();
					const der = new THREE.Vector3( -fwd.z, 0, fwd.x );
					const vel = VEL_CAMINAR * A.velocidad * dt;
					mover( ( fwd.x * -y + der.x * x ) * vel, ( fwd.z * -y + der.z * x ) * vel );
				}
			}
			// B (derecho) o Y (izquierdo): pausa
			const b = !! gp.buttons[ 5 ]?.pressed;
			if ( b && ! c.userData.botonB ) { if ( ctx.estado === 'jugando' ) ctx.pausar(); else if ( ctx.estado === 'pausa' ) ctx.reanudar(); }
			c.userData.botonB = b;
			if ( c.userData.mano === 'right' && ctx.estado === 'jugando' ) {
				if ( A.giroVR === 'suave' ) {
					if ( Math.abs( ax ) > 0.2 ) girarAlrededorDeCabeza( -ax * 2.2 * dt );
				} else {
					const giro = THREE.MathUtils.degToRad( A.giroVR === 'paso45' ? 45 : 30 );
					if ( Math.abs( ax ) > 0.7 && giroListo ) { girarAlrededorDeCabeza( ax > 0 ? -giro : giro ); giroListo = false; }
					else if ( Math.abs( ax ) < 0.3 ) giroListo = true;
				}
			}
			if ( c.userData.mano === 'right' ) {
				const a = !! gp.buttons[ 4 ]?.pressed;
				if ( a && ! botonA && ( ctx.estado === 'fin' || ctx.juego?.fin ) ) ctx.jugar( 'vr' );
				botonA = a;
			}
		}
	}

	// ---------- Menú de pausa dentro del VR (se apunta con el control derecho) ----------
	const menuVR = crearMenuVR( ctx );
	function girarAlrededorDeCabeza( ang ) {
		const cabeza = new THREE.Vector3(); camera.getWorldPosition( cabeza );
		player.position.sub( cabeza ).applyAxisAngle( new THREE.Vector3( 0, 1, 0 ), ang ).add( cabeza );
		player.rotation.y += ang;
	}

	// ---------- MODO PC: WASD + ratón ----------
	const teclas = {}; let yaw = 0, pitch = 0; ctx.modoPC = false;
	addEventListener( 'keydown', ( e ) => {
		teclas[ e.code ] = true;
		if ( ! ctx.modoPC ) return;
		if ( e.code === 'KeyP' ) { if ( ctx.estado === 'jugando' ) ctx.pausar(); else if ( ctx.estado === 'pausa' ) ctx.reanudar(); }
		if ( ctx.estado !== 'jugando' ) return;
		if ( e.code === 'KeyF' ) alternarLinterna();
		if ( e.code === 'KeyE' ) ctx.juego?.agarrar( camera );
		if ( e.code === 'KeyR' ) ctx.jugar( 'pc' );
	} );
	addEventListener( 'keyup', ( e ) => { teclas[ e.code ] = false; } );
	renderer.domElement.addEventListener( 'click', () => { if ( ctx.modoPC && ctx.estado === 'jugando' && ! renderer.xr.isPresenting ) bloquearRaton(); } );
	addEventListener( 'mousemove', ( e ) => {
		if ( document.pointerLockElement !== renderer.domElement ) return;
		const k = 0.0022 * A.sensibilidad;
		yaw -= e.movementX * k; pitch = THREE.MathUtils.clamp( pitch - e.movementY * k * ( A.invertirY ? -1 : 1 ), -1.4, 1.4 );
	} );
	function bloquearRaton() { try { const p = renderer.domElement.requestPointerLock?.(); p?.catch?.( () => {} ); } catch {} }
	ctx.bloquearRaton = bloquearRaton;
	ctx.activarPC = () => { ctx.modoPC = true; bloquearRaton(); };
	ctx.reiniciarVista = () => { yaw = 0; pitch = 0; };

	function actualizarPC( dt ) {
		player.rotation.y = yaw; camera.rotation.set( pitch, 0, 0 );
		if ( ! ctx.juego?.activo || ctx.estado !== 'jugando' ) return;
		const f = ( teclas.KeyW ? 1 : 0 ) - ( teclas.KeyS ? 1 : 0 ), l = ( teclas.KeyD ? 1 : 0 ) - ( teclas.KeyA ? 1 : 0 );
		if ( ! f && ! l ) return;
		const vel = ( teclas.ShiftLeft || teclas.ShiftRight ? VEL_CORRER : VEL_CAMINAR ) * A.velocidad * dt;
		const sx = Math.sin( yaw ), cz = Math.cos( yaw );
		mover( ( -sx * f + cz * l ) * vel, ( -cz * f - sx * l ) * vel );
	}

	// ---------- Seguimiento de las manos (posición y velocidad real del control) ----------
	const tmpV = new THREE.Vector3();
	function seguirManos( dt ) {
		for ( const c of mandos ) {
			const u = c.userData; if ( ! u.mano ) continue;
			u.grip.getWorldPosition( u.pos );
			if ( dt > 0 ) {
				tmpV.copy( u.pos ).sub( u.prev ).divideScalar( dt );
				u.vel.lerp( tmpV, 0.45 );                 // suavizado para que el lanzamiento sea estable
			}
			u.prev.copy( u.pos );
		}
	}

	// ---------- PC: lanzar (clic) y empujar (Q) ----------
	addEventListener( 'mousedown', ( e ) => {
		if ( ctx.estado !== 'jugando' || renderer.xr.isPresenting || e.button !== 0 ) return;
		if ( document.pointerLockElement === renderer.domElement ) ctx.juego?.lanzarPC();
	} );
	addEventListener( 'keydown', ( e ) => { if ( ctx.estado === 'jugando' && ctx.modoPC && e.code === 'KeyQ' && ! e.repeat ) ctx.juego?.empujarPC(); } );

	ctx.actualizarControles = ( dt ) => {
		colocarLinterna();
		if ( renderer.xr.isPresenting ) seguirManos( dt );
		if ( renderer.xr.isPresenting ) {
			actualizarVR( dt );
			if ( ctx.estado === 'jugando' ) actualizarArco(); else { arco.visible = marca.visible = false; }
			menuVR.actualizar( mando( 'right' ) );
		} else actualizarPC( dt );
	};
	ctx.menuVR = menuVR;
	ctx.mandos = mandos;
}

// Panel 3D de pausa para VR: botones que se apuntan con un rayo y se eligen con el gatillo
function crearMenuVR( ctx ) {
	const { scene, camera } = ctx;
	const grupo = new THREE.Group(); grupo.visible = false; scene.add( grupo );
	const opciones = [
		{ id: 'continuar', texto: '▶  Continuar', accion: () => ctx.reanudar() },
		{ id: 'reiniciar', texto: '↻  Reiniciar partida', accion: () => ctx.jugar( 'vr' ) },
		{ id: 'salir', texto: '⌂  Salir al menú', accion: () => ctx.irAlMenu() }
	];
	// fondo
	const fondoC = document.createElement( 'canvas' ); fondoC.width = 512; fondoC.height = 560;
	const fg = fondoC.getContext( '2d' );
	const gr = fg.createLinearGradient( 0, 0, 512, 560 ); gr.addColorStop( 0, 'rgba(40,30,90,0.9)' ); gr.addColorStop( 1, 'rgba(14,30,70,0.9)' );
	fg.fillStyle = gr; fg.strokeStyle = 'rgba(167,139,250,0.8)'; fg.lineWidth = 4;
	fg.beginPath(); fg.roundRect( 4, 4, 504, 552, 40 ); fg.fill(); fg.stroke();
	fg.fillStyle = '#fff'; fg.font = 'bold 56px Arial'; fg.textAlign = 'center'; fg.fillText( 'Pausa', 256, 92 );
	fg.fillStyle = '#9aa3c7'; fg.font = '26px Arial'; fg.fillText( 'Apunta y presiona el gatillo', 256, 136 );
	const fondo = new THREE.Mesh( new THREE.PlaneGeometry( 0.64, 0.7 ), new THREE.MeshBasicMaterial( { map: new THREE.CanvasTexture( fondoC ), transparent: true, fog: false, depthTest: false } ) );
	fondo.renderOrder = 20; grupo.add( fondo );
	const botones = opciones.map( ( o, i ) => {
		const c = document.createElement( 'canvas' ); c.width = 440; c.height = 96;
		const tex = new THREE.CanvasTexture( c );
		const m = new THREE.Mesh( new THREE.PlaneGeometry( 0.55, 0.12 ), new THREE.MeshBasicMaterial( { map: tex, transparent: true, fog: false, depthTest: false } ) );
		m.position.set( 0, 0.08 - i * 0.15, 0.002 ); m.renderOrder = 21;
		m.userData = { ...o, c, tex, hover: null };
		grupo.add( m ); return m;
	} );
	function pintar( b, hover ) {
		if ( b.userData.hover === hover ) return; b.userData.hover = hover;
		const g = b.userData.c.getContext( '2d' ); g.clearRect( 0, 0, 440, 96 );
		if ( hover ) { const gg = g.createLinearGradient( 0, 0, 440, 0 ); gg.addColorStop( 0, '#7c5cff' ); gg.addColorStop( 1, '#38bdf8' ); g.fillStyle = gg; }
		else g.fillStyle = 'rgba(255,255,255,0.08)';
		g.strokeStyle = 'rgba(167,139,250,0.6)'; g.lineWidth = 3;
		g.beginPath(); g.roundRect( 3, 3, 434, 90, 22 ); g.fill(); g.stroke();
		g.fillStyle = '#fff'; g.font = 'bold 38px Arial'; g.textAlign = 'center'; g.fillText( b.userData.texto, 220, 60 );
		b.userData.tex.needsUpdate = true;
	}
	botones.forEach( ( b ) => pintar( b, false ) );
	// rayo
	const rayo = new THREE.Line( new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3(), new THREE.Vector3( 0, 0, -1 ) ] ), new THREE.LineBasicMaterial( { color: 0xa78bfa } ) );
	rayo.scale.z = 3; rayo.visible = false;
	const ray = new THREE.Raycaster(), m4 = new THREE.Matrix4();
	let elegido = null, mandoConRayo = null;

	return {
		mostrar() {
			const p = new THREE.Vector3(), d = new THREE.Vector3();
			camera.getWorldPosition( p ); camera.getWorldDirection( d ); d.y = 0; d.normalize();
			grupo.position.copy( p ).addScaledVector( d, 1.3 ); grupo.position.y = p.y - 0.05;
			grupo.lookAt( p.x, grupo.position.y, p.z );
			grupo.visible = true;
		},
		ocultar() { grupo.visible = false; rayo.visible = false; },
		actualizar( c ) {
			if ( ! grupo.visible || ! c ) { rayo.visible = false; return; }
			if ( mandoConRayo !== c ) { c.add( rayo ); mandoConRayo = c; }
			rayo.visible = true;
			m4.identity().extractRotation( c.matrixWorld );
			ray.ray.origin.setFromMatrixPosition( c.matrixWorld );
			ray.ray.direction.set( 0, 0, -1 ).applyMatrix4( m4 );
			const hit = ray.intersectObjects( botones, false )[ 0 ];
			elegido = hit?.object ?? null;
			botones.forEach( ( b ) => pintar( b, b === elegido ) );
			rayo.scale.z = hit ? hit.distance : 3;
		},
		seleccionar() { if ( elegido ) { ctx.vibrar?.( 'right', 0.4, 40 ); elegido.userData.accion(); } }
	};
}
