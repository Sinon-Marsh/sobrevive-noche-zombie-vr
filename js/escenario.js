// =============================================================
// escenario.js  ·  Responsable: Avryl Chavez Tavera
// Mundo y ambiente: techo (cielo nocturno + luna), piso con textura,
// límites invisibles, iluminación, niebla, HDR y objetos fijos.
// =============================================================
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export const LIMITE = 32;          // radio del cilindro invisible que limita el juego (m)
const TAM_MUNDO = 140;

export function crearEscenario( ctx ) {
	const { scene, renderer, manager } = ctx;
	const tex = new THREE.TextureLoader( manager );
	const colliders = [];          // { x, z, r } obstáculos que no se pueden atravesar

	function cargar( ruta, repetir = 1, color = false ) {
		const t = tex.load( ruta );
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.repeat.set( repetir, repetir );
		t.anisotropy = Math.min( 8, renderer.capabilities.getMaxAnisotropy() );
		if ( color ) t.colorSpace = THREE.SRGBColorSpace;
		return t;
	}

	// ---------- Niebla nocturna ----------
	scene.fog = new THREE.FogExp2( 0x0a1420, 0.034 );
	scene.background = new THREE.Color( 0x050a12 );

	// ---------- HDR (reutilizado de la 3.4 / 3.5) como iluminación ambiental ----------
	new RGBELoader( manager ).load( 'assets/hdr/ladybrand_heritage_house_2k.hdr', ( hdr ) => {
		hdr.mapping = THREE.EquirectangularReflectionMapping;
		scene.environment = hdr;
		scene.environmentIntensity = 0.35;
	} );

	// ---------- TECHO: cúpula con textura de cielo nocturno + estrellas ----------
	const cielo = new THREE.Mesh(
		new THREE.SphereGeometry( 400, 48, 24 ),
		new THREE.MeshBasicMaterial( { map: cargar( 'assets/textures/sky/night_sky.jpg', 1, true ), side: THREE.BackSide, fog: false, depthWrite: false } )
	);
	cielo.material.map.wrapS = THREE.RepeatWrapping;
	cielo.renderOrder = -2;
	scene.add( cielo );

	// Luna con textura
	const luna = new THREE.Mesh(
		new THREE.SphereGeometry( 16, 32, 32 ),
		new THREE.MeshBasicMaterial( { map: cargar( 'assets/textures/sky/moon.jpg', 1, true ), fog: false } )
	);
	scene.add( luna );
	const halo = new THREE.Sprite( new THREE.SpriteMaterial( { map: haloTextura(), color: 0xbfd2ff, transparent: true, opacity: 0.55, fog: false, depthWrite: false } ) );
	halo.scale.set( 90, 90, 1 );
	scene.add( halo );

	// ---------- ILUMINACIÓN ----------
	scene.add( new THREE.HemisphereLight( 0x8fb2ff, 0x1a140c, 0.45 ) );
	const luzLuna = new THREE.DirectionalLight( 0xcfe2ff, 1.3 );
	luzLuna.position.set( -20, 40, -25 );
	luzLuna.castShadow = true;
	luzLuna.shadow.mapSize.set( 1024, 1024 );
	Object.assign( luzLuna.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 120 } );
	luzLuna.shadow.bias = -0.0008;
	scene.add( luzLuna, luzLuna.target );

	// ---------- PISO: tierra / pasto seco + plaza de piedras ----------
	const suelo = new THREE.Mesh(
		new THREE.PlaneGeometry( TAM_MUNDO, TAM_MUNDO ),
		new THREE.MeshStandardMaterial( {
			color: 0x7a6650,
			map: cargar( 'assets/textures/ground/ground_color.jpg', 30, true ),
			normalMap: cargar( 'assets/textures/ground/ground_normal.jpg', 30 ),
			aoMap: cargar( 'assets/textures/ground/ground_ao.jpg', 30 ),
			roughness: 1, metalness: 0, envMapIntensity: 0.4
		} )
	);
	suelo.rotation.x = -Math.PI / 2;
	suelo.receiveShadow = true;
	scene.add( suelo );

	const plaza = new THREE.Mesh(
		new THREE.CircleGeometry( 9, 64 ),
		new THREE.MeshStandardMaterial( { map: cargar( 'assets/textures/floor/pebble_floor.jpg', 5, true ), roughness: 0.9 } )
	);
	plaza.rotation.x = -Math.PI / 2;
	plaza.position.y = 0.01;
	plaza.receiveShadow = true;
	scene.add( plaza );
	ctx.suelos = [ suelo, plaza ];

	// ---------- LÍMITE INVISIBLE (cilindro) ----------
	// No se dibuja: solo se usa para impedir que el jugador y los zombies salgan.
	ctx.limitar = ( v, margen = 0.4 ) => {
		const r = Math.hypot( v.x, v.z ), max = LIMITE - margen;
		if ( r > max ) { v.x *= max / r; v.z *= max / r; }
		return v;
	};

	// ---------- ÁRBOLES (bosque alrededor + algunos dentro) ----------
	const N_ARBOLES = 150;
	const tronco = new THREE.InstancedMesh( new THREE.CylinderGeometry( 0.15, 0.28, 3, 7 ), new THREE.MeshStandardMaterial( { color: 0x3a2b1a, roughness: 1 } ), N_ARBOLES );
	const copa = new THREE.InstancedMesh( new THREE.ConeGeometry( 1.7, 4.2, 8 ), new THREE.MeshStandardMaterial( { color: 0x10291a, roughness: 0.95 } ), N_ARBOLES );
	tronco.castShadow = copa.castShadow = true;
	const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
	for ( let i = 0; i < N_ARBOLES; i ++ ) {
		const dentro = i < 18;
		const ang = Math.random() * Math.PI * 2;
		const r = dentro ? 13 + Math.random() * 16 : LIMITE + 1 + Math.random() * 30;
		let x = Math.cos( ang ) * r, z = Math.sin( ang ) * r; const k = 0.8 + Math.random() * 0.9;
		if ( ! dentro && Math.abs( x ) < 14 && z < -LIMITE ) x += x < 0 ? -14 : 14;   // deja ver la mansión
		q.setFromEuler( new THREE.Euler( 0, Math.random() * 6, 0 ) );
		m.compose( p.set( x, 1.5 * k, z ), q, s.set( k, k, k ) ); tronco.setMatrixAt( i, m );
		m.compose( p.set( x, ( 3 + 1.9 ) * k, z ), q, s.set( k, k, k ) ); copa.setMatrixAt( i, m );
		if ( dentro ) colliders.push( { x, z, r: 0.45 * k } );
	}
	scene.add( tronco, copa );

	// ---------- LÁPIDAS (textura de piedra) ----------
	const piedra = new THREE.MeshStandardMaterial( { map: cargar( 'assets/textures/stone/stone_diffuse.jpg', 1, true ), roughness: 1 } );
	for ( let i = 0; i < 16; i ++ ) {
		const ang = ( i / 16 ) * Math.PI * 2 + Math.random() * 0.3, r = 10 + Math.random() * 18;
		const x = Math.cos( ang ) * r, z = Math.sin( ang ) * r;
		const g = new THREE.Group();
		const base = new THREE.Mesh( new THREE.BoxGeometry( 0.9, 0.2, 0.5 ), piedra ); base.position.y = 0.1;
		const lapida = new THREE.Mesh( new THREE.BoxGeometry( 0.7, 1.1, 0.18 ), piedra ); lapida.position.y = 0.75;
		const cruz = new THREE.Mesh( new THREE.BoxGeometry( 0.55, 0.14, 0.18 ), piedra ); cruz.position.y = 1.05;
		[ base, lapida, cruz ].forEach( ( o ) => { o.castShadow = o.receiveShadow = true; g.add( o ); } );
		g.position.set( x, 0, z ); g.rotation.y = Math.random() * 0.6 - 0.3; g.rotation.z = Math.random() * 0.1 - 0.05;
		scene.add( g );
		colliders.push( { x, z, r: 0.55 } );
	}

	// ---------- POSTES DE LUZ (faroles cálidos) ----------
	const metal = new THREE.MeshStandardMaterial( { color: 0x1d1d1d, metalness: 0.7, roughness: 0.4 } );
	const faroles = [];
	[ [ 7, 7 ], [ -7, 7 ], [ 7, -7 ], [ -7, -7 ] ].forEach( ( [ x, z ] ) => {
		const poste = new THREE.Mesh( new THREE.CylinderGeometry( 0.06, 0.09, 3.2, 10 ), metal );
		poste.position.set( x, 1.6, z ); poste.castShadow = true; scene.add( poste );
		const foco = new THREE.Mesh( new THREE.SphereGeometry( 0.18, 16, 12 ), new THREE.MeshStandardMaterial( { color: 0xffd38a, emissive: 0xffb24d, emissiveIntensity: 4 } ) );
		foco.position.set( x, 3.3, z ); scene.add( foco );
		const luz = new THREE.PointLight( 0xffb45a, 14, 14, 2 );
		luz.position.set( x, 3.2, z ); scene.add( luz );
		faroles.push( { luz, foco, parpadeo: 0 } );
		colliders.push( { x, z, r: 0.25 } );
	} );


	// ---------- CERCA / REJA DE HIERRO en el límite (el límite real sigue siendo invisible) ----------
	const N_BARROTES = 360, rReja = LIMITE + 0.6;
	const barrote = new THREE.InstancedMesh( new THREE.CylinderGeometry( 0.025, 0.025, 1.6, 5 ), metal, N_BARROTES );
	const punta = new THREE.InstancedMesh( new THREE.ConeGeometry( 0.05, 0.16, 5 ), metal, N_BARROTES );
	for ( let i = 0; i < N_BARROTES; i ++ ) {
		const a = ( i / N_BARROTES ) * Math.PI * 2, x = Math.cos( a ) * rReja, z = Math.sin( a ) * rReja;
		m.compose( p.set( x, 0.8, z ), q.identity(), s.set( 1, 1, 1 ) ); barrote.setMatrixAt( i, m );
		m.compose( p.set( x, 1.68, z ), q.identity(), s.set( 1, 1, 1 ) ); punta.setMatrixAt( i, m );
	}
	scene.add( barrote, punta );
	[ 0.25, 1.4 ].forEach( ( y ) => {
		const riel = new THREE.Mesh( new THREE.TorusGeometry( rReja, 0.025, 4, 180 ), metal );
		riel.rotation.x = Math.PI / 2; riel.position.y = y; scene.add( riel );
	} );

	// ---------- MANSIÓN ABANDONADA al fondo (fuera del límite) ----------
	const mansion = crearMansion( cargar );
	mansion.position.set( 0, 0, -( LIMITE + 9 ) );
	scene.add( mansion );
	const ventanas = mansion.userData.ventanas;

	// ---------- ÁRBOLES SECOS / FRONDOSOS (otro tipo de árbol) ----------
	const N_REDONDOS = 40;
	const troncoR = new THREE.InstancedMesh( new THREE.CylinderGeometry( 0.18, 0.3, 2.6, 7 ), new THREE.MeshStandardMaterial( { color: 0x2e2217, roughness: 1 } ), N_REDONDOS );
	const copaR = new THREE.InstancedMesh( new THREE.IcosahedronGeometry( 1.6, 1 ), new THREE.MeshStandardMaterial( { color: 0x1d2a12, roughness: 1, flatShading: true } ), N_REDONDOS );
	troncoR.castShadow = copaR.castShadow = true;
	for ( let i = 0; i < N_REDONDOS; ) {
		const a = Math.random() * Math.PI * 2, r = LIMITE + 3 + Math.random() * 25, k = 0.8 + Math.random() * 0.7;
		const x = Math.cos( a ) * r, z = Math.sin( a ) * r;
		if ( Math.abs( x ) < 14 && z < -LIMITE ) continue;   // no tapar la mansión
		m.compose( p.set( x, 1.3 * k, z ), q.identity(), s.set( k, k, k ) ); troncoR.setMatrixAt( i, m );
		m.compose( p.set( x, 3.4 * k, z ), q.setFromEuler( new THREE.Euler( 0, a, 0 ) ), s.set( k * 1.1, k * 0.9, k ) ); copaR.setMatrixAt( i, m );
		i ++;
	}
	scene.add( troncoR, copaR );

	// ---------- LUCIÉRNAGAS ----------
	const N_LUZ = 140, posL = new Float32Array( N_LUZ * 3 ), baseL = [];
	for ( let i = 0; i < N_LUZ; i ++ ) {
		const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * ( LIMITE - 4 );
		baseL.push( [ Math.cos( a ) * r, 0.4 + Math.random() * 2.2, Math.sin( a ) * r, Math.random() * 10 ] );
	}
	const geoL = new THREE.BufferGeometry().setAttribute( 'position', new THREE.BufferAttribute( posL, 3 ) );
	const luciernagas = new THREE.Points( geoL, new THREE.PointsMaterial( { color: 0xd8ff6a, size: 0.14, map: haloTextura(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false } ) );
	luciernagas.frustumCulled = false;
	scene.add( luciernagas );

	// ---------- RELÁMPAGOS ----------
	const hemi = scene.children.find( ( o ) => o.isHemisphereLight );
	const rayo = new THREE.DirectionalLight( 0xcfdcff, 0 ); rayo.position.set( 20, 50, -30 ); scene.add( rayo );
	let proxRelampago = 6 + Math.random() * 8, destello = 0;
	const colorCielo = cielo.material.color;

	ctx.colliders = colliders;

	// aplica los ajustes de video que dependen del escenario
	ctx.aplicarEscenario = () => {
		const a = ctx.ajustes;
		luzLuna.castShadow = a.sombras;
		luciernagas.visible = a.luciernagas;
	};

	// El cielo y la luna siguen al jugador para que parezcan infinitamente lejanos
	const dirLuna = new THREE.Vector3( -0.45, 0.55, -0.7 ).normalize();
	ctx.actualizarEscenario = ( dt = 0.016, t = 0 ) => {
		const pos = ctx.player.position;

		// niebla que "respira" (sube y baja)
		scene.fog.density = ( 0.03 + Math.sin( t * 0.17 ) * 0.008 + Math.sin( t * 0.61 ) * 0.003 ) * ( ctx.ajustes?.niebla ?? 1 );

		// faroles que parpadean de vez en cuando
		faroles.forEach( ( f ) => {
			if ( f.parpadeo <= 0 && Math.random() < 0.004 ) f.parpadeo = 0.25 + Math.random() * 0.6;
			if ( f.parpadeo > 0 ) { f.parpadeo -= dt; const on = Math.random() > 0.5; f.luz.intensity = on ? 14 : 1; f.foco.material.emissiveIntensity = on ? 4 : 0.3; }
			else { f.luz.intensity = 14; f.foco.material.emissiveIntensity = 4; }
		} );

		// ventanas de la mansión con luz temblorosa de vela
		ventanas.forEach( ( v, i ) => { v.material.emissiveIntensity = 1.2 + Math.sin( t * 7 + i * 1.7 ) * 0.4 + Math.random() * 0.2; } );

		// luciérnagas flotando
		for ( let i = 0; i < N_LUZ; i ++ ) {
			const b = baseL[ i ];
			posL[ i * 3 ] = b[ 0 ] + Math.sin( t * 0.5 + b[ 3 ] ) * 0.8;
			posL[ i * 3 + 1 ] = b[ 1 ] + Math.sin( t * 1.3 + b[ 3 ] * 2 ) * 0.3;
			posL[ i * 3 + 2 ] = b[ 2 ] + Math.cos( t * 0.4 + b[ 3 ] ) * 0.8;
		}
		geoL.attributes.position.needsUpdate = true;
		luciernagas.material.opacity = 0.6 + Math.sin( t * 3 ) * 0.3;

		// relámpagos con trueno
		if ( ctx.ajustes?.relampagos !== false ) proxRelampago -= dt;
		if ( proxRelampago <= 0 ) {
			proxRelampago = 10 + Math.random() * 15; destello = 0.55;
			const retraso = 300 + Math.random() * 1200;
			setTimeout( () => ctx.sonar?.( 'trueno', 0.9 ), retraso );
		}
		if ( destello > 0 ) {
			destello -= dt;
			const on = destello > 0.4 || ( destello > 0.15 && destello < 0.25 );
			rayo.intensity = on ? 3.5 : 0; hemi.intensity = on ? 1.6 : 0.45;
			colorCielo.setScalar( on ? 2.2 : 1 ); scene.fog.color.set( on ? 0x56627a : 0x0a1420 );
		} else { rayo.intensity = 0; hemi.intensity = 0.45; colorCielo.setScalar( 1 ); scene.fog.color.set( 0x0a1420 ); }

		cielo.position.copy( pos );
		luna.position.copy( pos ).addScaledVector( dirLuna, 300 );
		halo.position.copy( luna.position );
		luzLuna.position.copy( pos ).addScaledVector( dirLuna, 50 );
		luzLuna.target.position.copy( pos );
	};
}

function haloTextura() {
	const c = document.createElement( 'canvas' ); c.width = c.height = 128;
	const g = c.getContext( '2d' ).createRadialGradient( 64, 64, 10, 64, 64, 64 );
	g.addColorStop( 0, 'rgba(255,255,255,0.9)' ); g.addColorStop( 0.35, 'rgba(255,255,255,0.25)' ); g.addColorStop( 1, 'rgba(255,255,255,0)' );
	const x = c.getContext( '2d' ); x.fillStyle = g; x.fillRect( 0, 0, 128, 128 );
	return new THREE.CanvasTexture( c );
}

// Mansión de dos pisos hecha con geometrías (paredes de piedra, techo, columnas y ventanas encendidas)
function crearMansion( cargar ) {
	const g = new THREE.Group();
	const piedra = new THREE.MeshStandardMaterial( { map: cargar( 'assets/textures/stone/stone_diffuse.jpg', 3, true ), color: 0x9a8c7a, roughness: 1 } );
	const techoMat = new THREE.MeshStandardMaterial( { color: 0x231a16, roughness: 0.9 } );
	const madera = new THREE.MeshStandardMaterial( { color: 0x2a1a10, roughness: 0.9 } );
	const cuerpo = new THREE.Mesh( new THREE.BoxGeometry( 22, 9, 8 ), piedra ); cuerpo.position.y = 4.5; g.add( cuerpo );
	const torre = new THREE.Mesh( new THREE.BoxGeometry( 5, 13, 5 ), piedra ); torre.position.set( 0, 6.5, 2 ); g.add( torre );
	for ( const lado of [ -1, 1 ] ) {         // techo a dos aguas
		const t = new THREE.Mesh( new THREE.BoxGeometry( 23, 0.35, 5.6 ), techoMat );
		t.rotation.x = lado * 0.75; t.position.set( 0, 10.9, lado * 2 ); g.add( t );
	}
	const techoT = new THREE.Mesh( new THREE.ConeGeometry( 4, 4.5, 4 ), techoMat ); techoT.rotation.y = Math.PI / 4; techoT.position.set( 0, 15.2, 2 ); g.add( techoT );
	const puerta = new THREE.Mesh( new THREE.BoxGeometry( 2, 3.4, 0.2 ), madera ); puerta.position.set( 0, 1.7, 4.55 ); g.add( puerta );
	for ( let i = -1; i <= 1; i += 2 ) { const col = new THREE.Mesh( new THREE.CylinderGeometry( 0.3, 0.35, 5, 10 ), piedra ); col.position.set( i * 1.8, 2.5, 5 ); g.add( col ); }
	const ventanas = [];
	const matVentana = () => new THREE.MeshStandardMaterial( { color: 0x1a1006, emissive: 0xffa040, emissiveIntensity: 1.3 } );
	[ -8.5, -5.5, 5.5, 8.5 ].forEach( ( x ) => [ 2.6, 6.4 ].forEach( ( y ) => {
		const oscura = Math.random() < 0.35;
		const v = new THREE.Mesh( new THREE.PlaneGeometry( 1.3, 1.9 ), oscura ? new THREE.MeshStandardMaterial( { color: 0x050505 } ) : matVentana() );
		v.position.set( x, y, 4.02 ); g.add( v ); if ( ! oscura ) ventanas.push( v );
	} ) );
	[ 7, 10.5 ].forEach( ( y ) => { const v = new THREE.Mesh( new THREE.CircleGeometry( 0.7, 20 ), matVentana() ); v.position.set( 0, y, 4.52 ); g.add( v ); ventanas.push( v ); } );
	g.traverse( ( o ) => { if ( o.isMesh ) { o.castShadow = true; o.receiveShadow = true; } } );
	g.userData.ventanas = ventanas;
	return g;
}
