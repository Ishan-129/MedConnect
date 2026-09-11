import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { 
  RotateCcw, Play, Pause, Activity, 
  MapPin, ShieldAlert, Zap, Navigation
} from 'lucide-react';

export interface HospitalNetworkNode {
  id: string;
  name: string;
  type: string;
  coords: [number, number, number];
  distance: string;
  icuBeds: number;
  bloodUnits: string;
  hasRareBlood: boolean;
  isHub: boolean;
}

const HOSPITALS: HospitalNetworkNode[] = [
  {
    id: 'mg-road-trauma',
    name: 'MG Road Trauma Center',
    type: 'Level 1 Trauma & Tertiary Hub',
    coords: [0, 0.25, 2.2],
    distance: '0.0 km',
    icuBeds: 18,
    bloodUnits: 'O-, A+, B+, AB+',
    hasRareBlood: true,
    isHub: true
  },
  {
    id: 'apollo-trauma',
    name: 'Apollo Trauma Indiranagar',
    type: 'Multi-Specialty & Cardiac Care',
    coords: [1.25, 0.65, 1.7],
    distance: '4.8 km',
    icuBeds: 12,
    bloodUnits: 'O-, B-, AB+',
    hasRareBlood: true,
    isHub: false
  },
  {
    id: 'manipal-hal',
    name: 'Manipal Hospital HAL',
    type: 'Super-Specialty Center',
    coords: [0.95, -1.05, 1.6],
    distance: '6.2 km',
    icuBeds: 8,
    bloodUnits: 'O+, A-, B+',
    hasRareBlood: false,
    isHub: false
  },
  {
    id: 'fortis-bannerghatta',
    name: 'Fortis Hospital Bannerghatta',
    type: 'Emergency & Maternity Care',
    coords: [-1.15, -0.95, 1.6],
    distance: '8.4 km',
    icuBeds: 14,
    bloodUnits: 'All Groups',
    hasRareBlood: true,
    isHub: false
  },
  {
    id: 'whitefield-community',
    name: 'Whitefield Community Hospital',
    type: 'General & Orthopedic Center',
    coords: [1.85, 0.75, 0.95],
    distance: '11.5 km',
    icuBeds: 6,
    bloodUnits: 'O+, B+',
    hasRareBlood: false,
    isHub: false
  },
  {
    id: 'medplus-clinic',
    name: 'MedPlus Emergency Clinic',
    type: 'Urgent Care & Triage Node',
    coords: [-0.75, 1.65, 1.35],
    distance: '13.1 km',
    icuBeds: 4,
    bloodUnits: 'O- Priority',
    hasRareBlood: true,
    isHub: false
  }
];

interface InteractiveNetworkGlobeProps {
  onSelectHospital?: (hospital: HospitalNetworkNode) => void;
  className?: string;
}

export const InteractiveNetworkGlobe: React.FC<InteractiveNetworkGlobeProps> = ({ 
  onSelectHospital,
  className = ''
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedHospital, setSelectedHospital] = useState<HospitalNetworkNode>(HOSPITALS[0]);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [filter, setFilter] = useState<'all' | 'icu' | 'blood'>('all');
  const [isSimulatingSOS, setIsSimulatingSOS] = useState(false);
  const [sosBannerText, setSosBannerText] = useState<string | null>(null);

  const isInteractingRef = useRef(false);
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const rotationVelocityRef = useRef({ x: 0, y: 0.0018 });
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodeMeshesRef = useRef<THREE.Mesh[]>([]);
  const arcLinesRef = useRef<THREE.Line[]>([]);
  const dataPacketsRef = useRef<Array<{
    mesh: THREE.Mesh;
    curve: THREE.QuadraticBezierCurve3;
    progress: number;
    speed: number;
  }>>([]);
  const rootGroupRef = useRef<THREE.Group | null>(null);
  const radarSweepMeshRef = useRef<THREE.Mesh | null>(null);
  const sosWaveMeshRef = useRef<THREE.Mesh | null>(null);
  const sosWaveProgressRef = useRef(0);
  const isSosActiveRef = useRef(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setIsAutoRotating(false);
    }
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 460;
    const height = container.clientHeight || 360;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(0, 0.5, 5.7);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const primaryLight = new THREE.DirectionalLight(0x2563eb, 1.3);
    primaryLight.position.set(5, 6, 6);
    scene.add(primaryLight);

    const softFillLight = new THREE.DirectionalLight(0x06b6d4, 0.8);
    softFillLight.position.set(-5, -4, 4);
    scene.add(softFillLight);

    const hubPointLight = new THREE.PointLight(0x3b82f6, 1.8, 12);
    hubPointLight.position.set(0, 0.3, 2.5);
    scene.add(hubPointLight);

    // 3. Central Pivot Group
    const rootGroup = new THREE.Group();
    rootGroupRef.current = rootGroup;
    scene.add(rootGroup);

    // 4. Luminous Holographic Regional Geo-Grid
    const globeRadius = 2.22;

    // Inner subtle glow core
    const coreGeo = new THREE.SphereGeometry(globeRadius * 0.98, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xeff6ff,
      transparent: true,
      opacity: 0.45
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    rootGroup.add(coreMesh);

    // Holographic wireframe grid
    const gridGeo = new THREE.SphereGeometry(globeRadius, 28, 28);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      wireframe: true,
      transparent: true,
      opacity: 0.12
    });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    rootGroup.add(gridMesh);

    // 5. Haversine 15 km Equatorial Perimeter Radar Ring
    const radarRingGeo = new THREE.RingGeometry(globeRadius + 0.12, globeRadius + 0.15, 64);
    const radarRingMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35
    });
    const radarRing = new THREE.Mesh(radarRingGeo, radarRingMat);
    radarRing.rotation.x = Math.PI / 2.25;
    rootGroup.add(radarRing);

    // Secondary dashed outer boundary (18 km regional perimeter)
    const outerRingGeo = new THREE.RingGeometry(globeRadius + 0.28, globeRadius + 0.29, 64);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.rotation.x = Math.PI / 2.25;
    rootGroup.add(outerRing);

    // Animated Rotating Radar Sweep Beam
    const sweepGeo = new THREE.RingGeometry(0.1, globeRadius + 0.28, 32, 1, 0, Math.PI / 3);
    const sweepMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.18
    });
    const sweepMesh = new THREE.Mesh(sweepGeo, sweepMat);
    sweepMesh.rotation.x = Math.PI / 2.25;
    rootGroup.add(sweepMesh);
    radarSweepMeshRef.current = sweepMesh;

    // Emergency SOS Pulse Wave Ring
    const sosRingGeo = new THREE.RingGeometry(0.05, 0.12, 48);
    const sosRingMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    const sosRing = new THREE.Mesh(sosRingGeo, sosRingMat);
    sosRing.position.copy(new THREE.Vector3(...HOSPITALS[0].coords));
    sosRing.lookAt(camera.position);
    rootGroup.add(sosRing);
    sosWaveMeshRef.current = sosRing;

    // 6. Ambient Floating Medical Telemetry Particles
    const particleCount = 140;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = globeRadius * (1.15 + Math.random() * 0.45);
      particlePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      particlePositions[i * 3 + 2] = r * Math.cos(phi);
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.035,
      transparent: true,
      opacity: 0.55
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    rootGroup.add(particleSystem);

    // 7. Hospital 3D Nodes, Beacons, and Arcs
    const nodeMeshes: THREE.Mesh[] = [];
    const arcLines: THREE.Line[] = [];
    const dataPackets: Array<{
      mesh: THREE.Mesh;
      curve: THREE.QuadraticBezierCurve3;
      progress: number;
      speed: number;
    }> = [];
    const hubCoords = new THREE.Vector3(...HOSPITALS[0].coords);

    HOSPITALS.forEach((hosp) => {
      const nodeGroup = new THREE.Group();
      const nodePos = new THREE.Vector3(...hosp.coords);
      nodeGroup.position.copy(nodePos);

      // Node core sphere
      const sphereRadius = hosp.isHub ? 0.13 : 0.085;
      const sphereGeo = new THREE.SphereGeometry(sphereRadius, 20, 20);
      const nodeColor = hosp.isHub ? 0x2563eb : (hosp.hasRareBlood ? 0xef4444 : 0x10b981);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: nodeColor,
        emissive: nodeColor,
        emissiveIntensity: 0.65,
        roughness: 0.2,
        metalness: 0.2
      });
      const nodeMesh = new THREE.Mesh(sphereGeo, sphereMat);
      nodeMesh.userData = { hospital: hosp, baseColor: nodeColor };
      nodeGroup.add(nodeMesh);

      // Outer Halo Ring
      const haloRadius = hosp.isHub ? 0.17 : 0.13;
      const haloGeo = new THREE.RingGeometry(haloRadius, haloRadius + 0.035, 24);
      const haloMat = new THREE.MeshBasicMaterial({
        color: hosp.isHub ? 0x3b82f6 : (hosp.hasRareBlood ? 0xf87171 : 0x34d399),
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.lookAt(camera.position);
      nodeGroup.add(haloMesh);

      // Vertical Beacon Light Shaft
      const beaconDir = nodePos.clone().normalize();
      const beaconGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        beaconDir.clone().multiplyScalar(0.22)
      ]);
      const beaconMat = new THREE.LineBasicMaterial({
        color: nodeColor,
        transparent: true,
        opacity: 0.6
      });
      const beaconLine = new THREE.Line(beaconGeo, beaconMat);
      nodeGroup.add(beaconLine);

      // Beacon Tip Marker
      const tipGeo = new THREE.SphereGeometry(0.025, 8, 8);
      const tipMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const tipMesh = new THREE.Mesh(tipGeo, tipMat);
      tipMesh.position.copy(beaconDir.clone().multiplyScalar(0.22));
      nodeGroup.add(tipMesh);

      // 3D Quadratic Bezier Curved Telemetry Pipeline to Hub
      if (!hosp.isHub) {
        const start = hubCoords;
        const end = nodePos;
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const distance = start.distanceTo(end);
        mid.add(mid.clone().normalize().multiplyScalar(distance * 0.28));

        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const arcPoints = curve.getPoints(36);
        const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
        const arcMat = new THREE.LineBasicMaterial({
          color: 0x3b82f6,
          transparent: true,
          opacity: 0.32
        });
        const arcLine = new THREE.Line(arcGeo, arcMat);
        arcLine.userData = { curve, targetHosp: hosp };
        rootGroup.add(arcLine);
        arcLines.push(arcLine);

        // Animated Traveling Data Packet
        const packetGeo = new THREE.SphereGeometry(0.04, 12, 12);
        const packetMat = new THREE.MeshBasicMaterial({
          color: hosp.hasRareBlood ? 0xf87171 : 0x60a5fa,
          transparent: true,
          opacity: 0.95
        });
        const packetMesh = new THREE.Mesh(packetGeo, packetMat);
        rootGroup.add(packetMesh);

        dataPackets.push({
          mesh: packetMesh,
          curve,
          progress: Math.random(),
          speed: 0.0035 + Math.random() * 0.002
        });
      }

      rootGroup.add(nodeGroup);
      nodeMeshes.push(nodeMesh);
    });

    nodeMeshesRef.current = nodeMeshes;
    arcLinesRef.current = arcLines;
    dataPacketsRef.current = dataPackets;

    // 8. Raycaster & Interactive Hover/Click Engine
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isInteractingRef.current) {
        const deltaX = e.clientX - pointerPosRef.current.x;
        const deltaY = e.clientY - pointerPosRef.current.y;
        pointerPosRef.current = { x: e.clientX, y: e.clientY };

        const rotY = deltaX * 0.006;
        const rotX = deltaY * 0.006;
        rootGroup.rotation.y += rotY;
        rootGroup.rotation.x += rotX;
        rotationVelocityRef.current = { x: rotX * 0.4, y: rotY * 0.4 };
      } else {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(nodeMeshesRef.current);
        if (intersects.length > 0) {
          const hosp = intersects[0].object.userData.hospital as HospitalNetworkNode | undefined;
          if (hosp) {
            setSelectedHospital(hosp);
            container.style.cursor = 'pointer';
          }
        } else {
          container.style.cursor = 'grab';
        }
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      isInteractingRef.current = true;
      pointerPosRef.current = { x: e.clientX, y: e.clientY };
      rotationVelocityRef.current = { x: 0, y: 0 };
      container.style.cursor = 'grabbing';
    };

    const handlePointerUp = () => {
      isInteractingRef.current = false;
      container.style.cursor = 'grab';
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.003;
      camera.position.z = Math.max(4.2, Math.min(7.2, camera.position.z + zoomDelta));
    };

    const handleClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeMeshesRef.current);
      if (intersects.length > 0) {
        const hosp = intersects[0].object.userData.hospital as HospitalNetworkNode | undefined;
        if (hosp) {
          setSelectedHospital(hosp);
          if (onSelectHospital) onSelectHospital(hosp);
        }
      }
    };

    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('click', handleClick);

    // 9. Animation Loop
    let animationId: number;

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      if (isAutoRotating && !isInteractingRef.current) {
        rootGroup.rotation.y += 0.0022;
      } else if (!isInteractingRef.current) {
        rootGroup.rotation.y += rotationVelocityRef.current.y;
        rootGroup.rotation.x += rotationVelocityRef.current.x;
        rotationVelocityRef.current.y *= 0.94;
        rotationVelocityRef.current.x *= 0.94;
      }

      if (radarSweepMeshRef.current) {
        radarSweepMeshRef.current.rotation.z -= 0.025;
      }

      particleSystem.rotation.y -= 0.0008;

      dataPacketsRef.current.forEach((dp) => {
        dp.progress += dp.speed;
        if (dp.progress > 1) dp.progress = 0;
        const point = dp.curve.getPoint(dp.progress);
        dp.mesh.position.copy(point);
      });

      if (isSosActiveRef.current && sosWaveMeshRef.current) {
        sosWaveProgressRef.current += 0.025;
        const scale = 1 + sosWaveProgressRef.current * 4.5;
        sosWaveMeshRef.current.scale.set(scale, scale, 1);
        const mat = sosWaveMeshRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.8 - sosWaveProgressRef.current * 0.8);

        if (sosWaveProgressRef.current >= 1.0) {
          isSosActiveRef.current = false;
          mat.opacity = 0;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // 10. Resize Observer
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight || 360;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('click', handleClick);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [isAutoRotating, onSelectHospital]);

  // Update node and arc visibility based on filters
  useEffect(() => {
    nodeMeshesRef.current.forEach((mesh) => {
      const hosp = mesh.userData.hospital as HospitalNetworkNode | undefined;
      if (!hosp || !mesh.parent) return;
      let visible = true;
      if (filter === 'icu') visible = hosp.icuBeds >= 10;
      else if (filter === 'blood') visible = hosp.hasRareBlood;
      mesh.parent.visible = visible;
    });

    arcLinesRef.current.forEach((arc) => {
      const hosp = arc.userData.targetHosp as HospitalNetworkNode | undefined;
      if (!hosp) return;
      let visible = true;
      if (filter === 'icu') visible = hosp.icuBeds >= 10;
      else if (filter === 'blood') visible = hosp.hasRareBlood;
      arc.visible = visible;
    });
  }, [filter]);

  const handleResetAngle = () => {
    if (rootGroupRef.current) {
      rootGroupRef.current.rotation.set(0, 0, 0);
      rotationVelocityRef.current = { x: 0, y: 0 };
    }
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0.5, 5.7);
    }
  };

  const handleTriggerSOSPulse = () => {
    if (isSimulatingSOS) return;
    setIsSimulatingSOS(true);
    isSosActiveRef.current = true;
    sosWaveProgressRef.current = 0;
    setSosBannerText('🚨 Emergency SOS Broadcast Active · Broadcasting 15 km Haversine to 5 nearby care centers');

    dataPacketsRef.current.forEach((dp) => {
      (dp.mesh.material as THREE.MeshBasicMaterial).color.setHex(0xef4444);
      dp.speed = 0.012;
    });

    setTimeout(() => {
      dataPacketsRef.current.forEach((dp) => {
        (dp.mesh.material as THREE.MeshBasicMaterial).color.setHex(0x60a5fa);
        dp.speed = 0.0035;
      });
      setIsSimulatingSOS(false);
      setSosBannerText(null);
    }, 3800);
  };

  return (
    <div className={`relative w-full rounded-2xl bg-gradient-to-br from-white/95 via-slate-50/90 to-blue-50/50 border border-blue-100/90 shadow-card hover:shadow-card-hover overflow-hidden text-left select-none transition-all duration-300 ${className}`}>
      
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-100/35 via-transparent to-transparent pointer-events-none" />

      {/* 1. Header HUD Overlay */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 flex-wrap pointer-events-none">
        
        {/* Status Pill */}
        <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-soft flex items-center gap-2 pointer-events-auto">
          <Activity className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-900 tracking-tight">3D Regional Geo-Radar</span>
          <span className="text-[10px] font-mono text-emerald-700 font-bold tabular-nums bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
            15 km Haversine
          </span>
        </div>

        {/* Interactive HUD Controls */}
        <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md p-1 rounded-xl border border-slate-200/80 shadow-soft pointer-events-auto">
          
          {/* Play/Pause */}
          <button
            type="button"
            onClick={() => setIsAutoRotating(!isAutoRotating)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title={isAutoRotating ? 'Pause auto-rotation' : 'Resume auto-rotation'}
          >
            {isAutoRotating ? <Pause className="w-3.5 h-3.5 text-blue-600" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          {/* Reset Angle */}
          <button
            type="button"
            onClick={handleResetAngle}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Reset 3D camera angle & zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Simulate SOS */}
          <button
            type="button"
            onClick={handleTriggerSOSPulse}
            disabled={isSimulatingSOS}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            title="Simulate real-time emergency dispatch pulse across 3D network"
          >
            <Zap className={`w-3 h-3 text-rose-600 ${isSimulatingSOS ? 'animate-bounce' : ''}`} />
            <span>Simulate SOS</span>
          </button>

          {/* Filter Pills */}
          <div className="hidden sm:flex items-center gap-1 pl-1.5 border-l border-slate-200 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                filter === 'all' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter('icu')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                filter === 'icu' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ICU &gt; 10
            </button>
            <button
              type="button"
              onClick={() => setFilter('blood')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                filter === 'blood' ? 'bg-rose-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rare Blood
            </button>
          </div>

        </div>
      </div>

      {/* SOS Alert Banner */}
      {sosBannerText && (
        <div className="absolute top-14 left-3 right-3 z-20 bg-rose-50/95 border border-rose-200 text-rose-800 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-soft flex items-center gap-2 animate-pulse">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{sosBannerText}</span>
        </div>
      )}

      {/* 2. Three.js Canvas Container */}
      <div 
        ref={mountRef} 
        className="w-full h-[320px] sm:h-[350px] cursor-grab active:cursor-grabbing"
      />

      {/* Navigation Hint */}
      <div className="absolute bottom-3 right-3 text-[9px] font-mono text-slate-400 pointer-events-none hidden sm:flex items-center gap-1 bg-white/75 backdrop-blur-xs px-2 py-0.5 rounded-full border border-slate-200/60">
        <Navigation className="w-2.5 h-2.5 text-slate-400" />
        <span>Drag to rotate · Wheel to zoom · Click node</span>
      </div>

    </div>
  );
};
