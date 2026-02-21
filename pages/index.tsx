import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GoogleMap,
  Polygon,
  Polyline,
  InfoWindow,
  useLoadScript,
} from '@react-google-maps/api';
import Head from 'next/head';

const MAP_CENTER = { lat: 43.793, lng: -79.345 };
const MAP_ZOOM = 12;

interface Region {
  id: string;
  name: string;
  nameEn: string;
  color: string;
  paths: google.maps.LatLngLiteral[];
}

// 四条道路围成的区域。paths 仅为粗略顶点，用于地图加载时的占位与图例定位；
// 真正的边界由下方按"路口名称"路由后吸附到路面得到。
const region: Region = {
  id: 'mccowan-bathurst-elgin-eglinton',
  name: 'McCowan Rd以东 · Elgin Mills Rd以南 · Bathurst St以东 · Eglinton Ave以南',
  nameEn: 'East of McCowan, South of Elgin Mills, East of Bathurst, South of Eglinton',
  color: '#E74C3C',
  paths: [
    { lat: 43.916, lng: -79.466 }, // 西北角 Bathurst St × Elgin Mills Rd
    { lat: 43.886, lng: -79.283 }, // 东北角 McCowan Rd × Elgin Mills Rd
    { lat: 43.735, lng: -79.25 }, // 东南角 McCowan Rd × Eglinton Ave E
    { lat: 43.705, lng: -79.419 }, // 西南角 Bathurst St × Eglinton Ave W
  ],
};

// 区域四条边，按顺时针顺序。每条边用真实"路口名称"作为起点/终点和沿途锚点，
// 交由 Google 精确地理编码后沿对应道路路由（禁用高速），从而严格贴合该道路并
// 保留全部弯曲——避免了手填经纬度不准导致吸附到错误平行道路的问题。
interface BoundaryEdge {
  road: string;
  origin: string;
  destination: string;
  via: string[];
  fallback: google.maps.LatLngLiteral[]; // 路由失败时退回的直线段端点
}

const BOUNDARY_EDGES: BoundaryEdge[] = [
  // 北边：Elgin Mills Rd，从 Bathurst 向东到 McCowan
  {
    road: 'Elgin Mills Rd',
    origin: 'Bathurst St & Elgin Mills Rd, Richmond Hill, ON',
    destination: 'McCowan Rd & Elgin Mills Rd E, Markham, ON',
    via: [
      'Yonge St & Elgin Mills Rd, Richmond Hill, ON',
      'Bayview Ave & Elgin Mills Rd E, Richmond Hill, ON',
      'Leslie St & Elgin Mills Rd E, Richmond Hill, ON',
      // 'Woodbine Ave & Elgin Mills Rd E, Markham, ON',
      // 'Victoria Park Ave & Elgin Mills Rd E, Markham, ON',
      'Warden Ave & Elgin Mills Rd E, Markham, ON',
      'Kennedy Rd & Elgin Mills Rd E, Markham, ON',
    ],
    fallback: [region.paths[0], region.paths[1]],
  },
  // 东边：McCowan Rd，从 Elgin Mills 向南到 Eglinton
  {
    road: 'McCowan Rd',
    origin: 'McCowan Rd & Elgin Mills Rd E, Markham, ON',
    destination: 'Danforth Rd & Eglinton Ave E, Scarborough, ON',
    via: [
      'McCowan Rd & Major Mackenzie Dr E, Markham, ON',
      'McCowan Rd & Highway 7, Markham, ON',
      // 'McCowan Rd & Steeles Ave E, Toronto, ON',
      // 'McCowan Rd & Sheppard Ave E, Toronto, ON',
      'McCowan Rd & Ellesmere Rd, Toronto, ON',
      'McCowan Rd & Lawrence Ave E, Toronto, ON',
    ],
    fallback: [region.paths[1], region.paths[2]],
  },
  // 南边：Eglinton Ave，从 McCowan 向西到 Bathurst
  {
    road: 'Eglinton Ave',
    origin: 'Danforth Rd & Eglinton Ave E, Scarborough, ON',
    destination: 'Bathurst St & Eglinton Ave W, Toronto, ON',
    via: [
      'Kennedy Rd & Eglinton Ave E, Toronto, ON',
      'Victoria Park Ave & Eglinton Ave E, Toronto, ON',
      'Don Mills Rd & Eglinton Ave E, Toronto, ON',
      'Bayview Ave & Eglinton Ave E, Toronto, ON',
      'Yonge St & Eglinton Ave, Toronto, ON',
    ],
    fallback: [region.paths[2], region.paths[3]],
  },
  // 西边：Bathurst St，从 Eglinton 向北到 Elgin Mills
  {
    road: 'Bathurst St',
    origin: 'Bathurst St & Eglinton Ave W, Toronto, ON',
    destination: 'Bathurst St & Elgin Mills Rd, Richmond Hill, ON',
    via: [
      'Bathurst St & Lawrence Ave W, Toronto, ON',
      // 'Bathurst St & Sheppard Ave W, Toronto, ON',
      'Bathurst St & Steeles Ave W, Toronto, ON',
      // 'Bathurst St & Centre St, Vaughan, ON',
      // 'Bathurst St & Major Mackenzie Dr W, Richmond Hill, ON',
    ],
    fallback: [region.paths[3], region.paths[0]],
  },
];

// 用 Directions 把一条边吸附到真实道路上：
// 用路口名称作为起点/终点/途经点 + 禁用高速，保证整段紧贴指定主干道并保留弯曲。
function routeAlongRoad(
  service: google.maps.DirectionsService,
  edge: BoundaryEdge,
): Promise<google.maps.LatLngLiteral[]> {
  return new Promise((resolve) => {
    service.route(
      {
        origin: edge.origin,
        destination: edge.destination,
        waypoints: edge.via.map((location) => ({ location, stopover: false })),
        travelMode: google.maps.TravelMode.DRIVING,
        avoidHighways: true,
        avoidFerries: true,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result?.routes?.[0]) {
          const points: google.maps.LatLngLiteral[] = [];
          result.routes[0].legs.forEach((leg) =>
            leg.steps.forEach((step) =>
              step.path.forEach((p) => points.push({ lat: p.lat(), lng: p.lng() })),
            ),
          );
          resolve(points.length ? points : edge.fallback);
        } else {
          // 失败时退回直线段
          resolve(edge.fallback);
        }
      },
    );
  });
}

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
};

const defaultMapOptions: google.maps.MapOptions = {
  mapTypeControl: true,
  streetViewControl: false,
  fullscreenControl: true,
  zoomControl: true,
  mapTypeId: 'roadmap',
  tilt: 0,
  rotateControl: false,
};

export default function Home() {
  const [selected, setSelected] = useState(false);
  const [, setMap] = useState<google.maps.Map | null>(null);
  // 吸附到真实道路后的边界（null 时先用直线顶点占位）
  const [snappedPath, setSnappedPath] = useState<google.maps.LatLngLiteral[] | null>(
    null,
  );

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
  });

  // 地图脚本加载后，沿四条道路逐段路由，把边界吸附到路面
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    const service = new google.maps.DirectionsService();

    Promise.all(
      BOUNDARY_EDGES.map((edge) => routeAlongRoad(service, edge)),
    ).then((edgePaths) => {
      if (cancelled) return;
      setSnappedPath(edgePaths.flat());
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded]);

  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const polygonOptions = useMemo(
    () => ({
      fillOpacity: 0.18,
      strokeOpacity: 0, // 隐藏实线边框，改用下方的虚线 Polyline
      strokeWeight: 0,
    }),
    [],
  );

  // 区域多边形：优先用吸附后的路面边界，否则退回直线顶点
  const regionPath = snappedPath ?? region.paths;

  // 闭合的虚线路径：在末尾追加起点，把边框连成一圈
  const dashedPath = useMemo(
    () => (regionPath.length ? [...regionPath, regionPath[0]] : regionPath),
    [regionPath],
  );

  const dashedLineOptions = useMemo<google.maps.PolylineOptions>(
    () => ({
      strokeOpacity: 0, // 整条线透明，仅显示重复的虚线符号
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeColor: region.color,
            strokeOpacity: 1,
            strokeWeight: 3,
            scale: 3,
          },
          offset: '0',
          repeat: '18px',
        },
      ],
    }),
    [],
  );

  if (!apiKey) {
    return (
      <div style={noKeyContainerStyle}>
        <h1>Google Maps API Key 未设置</h1>
        <p>
          请在项目根目录创建 <code>.env.local</code> 文件并添加你的 API Key：
        </p>
        <pre>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=你的API_KEY</pre>
        <p>
          获取 API Key:{' '}
          <a
            href="https://console.cloud.google.com/google/maps-apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Cloud Console
          </a>
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={noKeyContainerStyle}>
        <h1>地图加载失败</h1>
        <p>请检查你的 Google Maps API Key 是否有效，以及是否启用了 Maps JavaScript API。</p>
        <pre>{loadError.message}</pre>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={noKeyContainerStyle}>
        <h1>加载中...</h1>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>GTA 区域地图</title>
        <meta name="description" content="大多伦多地区区域划分图" />
      </Head>

      <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          options={defaultMapOptions}
          onLoad={onLoad}
          onUnmount={onUnmount}
        >
          <Polygon
            key={region.id}
            paths={regionPath}
            options={{
              ...polygonOptions,
              fillColor: region.color,
              strokeColor: region.color,
            }}
            onClick={() => setSelected(true)}
          />

          <Polyline path={dashedPath} options={dashedLineOptions} />

          {selected && (
            <InfoWindow
              position={getCenter(region.paths)}
              onCloseClick={() => setSelected(false)}
            >
              <div style={{ padding: 4, maxWidth: 320 }}>
                <strong>{region.name}</strong>
                <br />
                <span style={{ fontSize: 12, color: '#666' }}>{region.nameEn}</span>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        <div style={legendContainerStyle}>
          <div style={legendItemStyle}>
            <span style={{ ...legendColorStyle, borderColor: region.color }} />
            <span style={legendLabelStyle}>{region.name}</span>
          </div>
        </div>
      </div>
    </>
  );
}

function getCenter(paths: google.maps.LatLngLiteral[]): google.maps.LatLngLiteral {
  const sum = paths.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / paths.length, lng: sum.lng / paths.length };
}

const noKeyContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  padding: 24,
  textAlign: 'center',
  lineHeight: 1.8,
};

const legendContainerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 30,
  left: 12,
  background: 'white',
  padding: '12px 16px',
  borderRadius: 8,
  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  zIndex: 10,
};

const legendItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 0',
};

const legendColorStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 3,
  marginRight: 10,
  flexShrink: 0,
  border: '2px dashed',
  backgroundColor: 'transparent',
};

const legendLabelStyle: React.CSSProperties = {
  fontSize: 13,
};
