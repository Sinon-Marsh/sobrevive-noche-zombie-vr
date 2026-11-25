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
const GIRO = THREE.MathUtils.degToRad( 30 );

export function crearControles( ctx ) {
	const { renderer, scene, camera, player } = ctx;

	// ---------- Botón ENTER VR (se coloca en la portada) ----------
	const vrBtn = VRButton.createButton( renderer );
	document.getElementById( 'botones' ).appendChild( vrBtn );

	// ---------- Controles y sus modelos 3D ----------
	const fabrica = new XRControllerModelFactory();
	const mandos = [ 0, 1 ].map( ( i ) => {
		const c = renderer.xr.getController( i );
		const grip = renderer.xr.getControllerGrip( i );
		grip.add( fabrica.createControllerModel( grip ) );
		player.add( c, grip );
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
		c.addEventListener( 'squeezestart', () => ctx.juego?.agarrar( c ) );
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
			if ( c.userData.mano === 'left' && ctx.juego?.activo ) {
				const x = Math.abs( ax ) > 0.15 ? ax : 0, y = Math.abs( ay ) > 0.15 ? ay : 0;
				if ( x || y ) {
					const fwd = new THREE.Vector3(); camera.getWorldDirection( fwd ); fwd.y = 0; fwd.normalize();
					const der = new THREE.Vector3( -fwd.z, 0, fwd.x );
					const vel = VEL_CAMINAR * dt;
					mover( ( fwd.x * -y + der.x * x ) * vel, ( fwd.z * -y + der.z * x ) * vel );
				}
			}
			if ( c.userData.mano === 'right' ) {
				if ( Math.abs( ax ) > 0.7 && giroListo ) {
					girarAlrededorDeCabeza( ax > 0 ? -GIRO : GIRO ); giroListo = false;
				} else if ( Math.abs( ax ) < 0.3 ) giroListo = true;
				const a = !! gp.buttons[ 4 ]?.pressed;
				if ( a && ! botonA ) ctx.juego?.reiniciar();
				botonA = a;
			}
		}
	}
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
		if ( e.code === 'KeyF' ) alternarLinterna();
		if ( e.code === 'KeyE' ) ctx.juego?.agarrar( camera );
		if ( e.code === 'KeyR' ) ctx.juego?.reiniciar();
	} );
	addEventListener( 'keyup', ( e ) => { teclas[ e.code ] = false; } );
	renderer.domElement.addEventListener( 'click', () => { if ( ctx.modoPC && ! renderer.xr.isPresenting ) renderer.domElement.requestPointerLock?.(); } );
	addEventListener( 'mousemove', ( e ) => {
		if ( document.pointerLockElement !== renderer.domElement ) return;
		yaw -= e.movementX * 0.0022; pitch = THREE.MathUtils.clamp( pitch - e.movementY * 0.0022, -1.4, 1.4 );
	} );
	ctx.activarPC = () => { ctx.modoPC = true; renderer.domElement.requestPointerLock?.(); };

	function actualizarPC( dt ) {
		player.rotation.y = yaw; camera.rotation.set( pitch, 0, 0 );
		if ( ! ctx.juego?.activo ) return;
		const f = ( teclas.KeyW ? 1 : 0 ) - ( teclas.KeyS ? 1 : 0 ), l = ( teclas.KeyD ? 1 : 0 ) - ( teclas.KeyA ? 1 : 0 );
		if ( ! f && ! l ) return;
		const vel = ( teclas.ShiftLeft || teclas.ShiftRight ? VEL_CORRER : VEL_CAMINAR ) * dt;
		const sx = Math.sin( yaw ), cz = Math.cos( yaw );
		mover( ( -sx * f + cz * l ) * vel, ( -cz * f - sx * l ) * vel );
	}

	ctx.actualizarControles = ( dt ) => {
		colocarLinterna();
		if ( renderer.xr.isPresenting ) { actualizarVR( dt ); actualizarArco(); }
		else actualizarPC( dt );
	};
	ctx.mandos = mandos;
}
