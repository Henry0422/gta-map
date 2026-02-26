import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  GoogleMap,
  Polygon,
  Polyline,
  InfoWindow,
  useLoadScript,
} from '@react-google-maps/api';
import Head from 'next/head';

const MAP_CENTER = { lat: 43.805, lng: -79.365 };
const MAP_ZOOM = 11;

interface BoundaryEdge {
  road: string;
  origin: string;
  destination: string;
  via: string[];
  fallback: google.maps.LatLngLiteral[]; // 路由失败时退回的直线段端点
}

interface Region {
  id: string;
  name: string;
  nameEn: string;
  color: string;
  paths: google.maps.LatLngLiteral[];
  boundaryEdges: BoundaryEdge[];
}

// 四条道路围成的区域。paths 仅为粗略顶点，用于地图加载时的占位与图例定位；
// 真正的边界由下方按"路口名称"路由后吸附到路面得到。
const REGIONS: Region[] = [
  {
    id: 'dufferin-markham-elgin-mills-eglinton',
    name: 'Dufferin St以东 · Elgin Mills Rd以南 · Markham Rd以西 · Eglinton Ave以南',
    nameEn: 'East of Dufferin, South of Elgin Mills, West of Markham, South of Eglinton',
    color: '#3498DB',
    paths: [
      { lat: 43.897, lng: -79.489 }, // 西北角 Dufferin St × Teston Rd（Elgin Mills 西向延伸）
      { lat: 43.913, lng: -79.26 }, // 东北角 Markham Rd × Elgin Mills Rd
      { lat: 43.735, lng: -79.26 }, // 东南角 Markham Rd × Eglinton Ave E
      { lat: 43.705, lng: -79.478 }, // 西南角 Dufferin St × Eglinton Ave W
    ],
    boundaryEdges: [
      // 北边：Teston Rd（Dufferin→Bathurst）+ Elgin Mills Rd（Bathurst→Markham）
      {
        road: 'Elgin Mills Rd',
        origin: 'Dufferin St & Teston Rd, Vaughan, ON',
        destination: 'Markham Rd & Elgin Mills Rd E, Markham, ON',
        via: [
          'Bathurst St & Teston Rd, Vaughan, ON',
          'Bathurst St & Elgin Mills Rd W, Richmond Hill, ON',
          'Yonge St & Elgin Mills Rd E, Richmond Hill, ON',
          'Bayview Ave & Elgin Mills Rd E, Richmond Hill, ON',
          'Leslie St & Elgin Mills Rd E, Richmond Hill, ON',
          'Woodbine Ave & Elgin Mills Rd E, Markham, ON',
          'Warden Ave & Elgin Mills Rd E, Markham, ON',
          'McCowan Rd & Elgin Mills Rd E, Markham, ON',
        ],
        fallback: [
          { lat: 43.897, lng: -79.489 },
          { lat: 43.913, lng: -79.26 },
        ],
      },
      // 东边：Markham Rd，从 Elgin Mills 向南到 Eglinton
      {
        road: 'Markham Rd',
        origin: 'Markham Rd & Elgin Mills Rd E, Markham, ON',
        destination: 'Markham Rd & Eglinton Ave E, Scarborough, ON',
        via: [
          'Markham Rd & Major Mackenzie Dr E, Markham, ON',
          'Markham Rd & Highway 7, Markham, ON',
          'Markham Rd & Steeles Ave E, Toronto, ON',
          'Markham Rd & Sheppard Ave E, Toronto, ON',
          'Markham Rd & Lawrence Ave E, Toronto, ON',
        ],
        fallback: [
          { lat: 43.913, lng: -79.26 },
          { lat: 43.735, lng: -79.26 },
        ],
      },
      // 南边：Eglinton Ave，从 Markham 向西到 Dufferin
      {
        road: 'Eglinton Ave',
        origin: 'Markham Rd & Eglinton Ave E, Scarborough, ON',
        destination: 'Dufferin St & Eglinton Ave W, Toronto, ON',
        via: [
          'Kennedy Rd & Eglinton Ave E, Toronto, ON',
          'Victoria Park Ave & Eglinton Ave E, Toronto, ON',
          'Don Mills Rd & Eglinton Ave E, Toronto, ON',
          'Bayview Ave & Eglinton Ave E, Toronto, ON',
          'Yonge St & Eglinton Ave, Toronto, ON',
          'Allen Rd & Eglinton Ave W, Toronto, ON',
        ],
        fallback: [
          { lat: 43.735, lng: -79.26 },
          { lat: 43.705, lng: -79.478 },
        ],
      },
      // 西边：Dufferin St，从 Eglinton 向北到 Teston Rd（Elgin Mills 纬度）
      {
        road: 'Dufferin St',
        origin: 'Dufferin St & Eglinton Ave W, Toronto, ON',
        destination: 'Dufferin St & Teston Rd, Vaughan, ON',
        via: [
          'Dufferin St & Lawrence Ave W, Toronto, ON',
          'Dufferin St & Sheppard Ave W, Toronto, ON',
          'Dufferin St & Steeles Ave W, Toronto, ON',
          'Dufferin St & Rutherford Rd, Vaughan, ON',
        ],
        fallback: [
          { lat: 43.705, lng: -79.478 },
          { lat: 43.897, lng: -79.489 },
        ],
      },
    ],
  },
  {
    id: 'mccowan-bathurst-major-mackenzie-eglinton',
    name: 'McCowan Rd以东 · Major Mackenzie Dr以南 · Bathurst St以东 · Eglinton Ave以南',
    nameEn: 'East of McCowan, South of Major Mackenzie, East of Bathurst, South of Eglinton',
    color: '#E74C3C',
    paths: [
      { lat: 43.866, lng: -79.463 }, // 西北角 Bathurst St × Major Mackenzie Dr
      { lat: 43.903, lng: -79.293 }, // 东北角 McCowan Rd × Major Mackenzie Dr
      { lat: 43.735, lng: -79.25 }, // 东南角 McCowan Rd × Eglinton Ave E
      { lat: 43.705, lng: -79.419 }, // 西南角 Bathurst St × Eglinton Ave W
    ],
    boundaryEdges: [
      // 北边：Major Mackenzie Dr，从 Bathurst 向东到 McCowan
      {
        road: 'Major Mackenzie Dr',
        origin: 'Bathurst St & Major Mackenzie Dr W, Richmond Hill, ON',
        destination: 'McCowan Rd & Major Mackenzie Dr E, Markham, ON',
        via: [
          'Yonge St & Major Mackenzie Dr, Richmond Hill, ON',
          'Warden Ave & Major Mackenzie Dr E, Markham, ON',
        ],
        fallback: [
          { lat: 43.866, lng: -79.463 },
          { lat: 43.903, lng: -79.293 },
        ],
      },
      // 东边：McCowan Rd，从 Major Mackenzie 向南到 Eglinton
      {
        road: 'McCowan Rd',
        origin: 'McCowan Rd & Major Mackenzie Dr E, Markham, ON',
        destination: 'Danforth Rd & Eglinton Ave E, Scarborough, ON',
        via: [
          'McCowan Rd & Highway 7, Markham, ON',
          'McCowan Rd & Ellesmere Rd, Toronto, ON',
          'McCowan Rd & Lawrence Ave E, Toronto, ON',
        ],
        fallback: [
          { lat: 43.903, lng: -79.293 },
          { lat: 43.735, lng: -79.25 },
        ],
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
        fallback: [
          { lat: 43.735, lng: -79.25 },
          { lat: 43.705, lng: -79.419 },
        ],
      },
      // 西边：Bathurst St，从 Eglinton 向北到 Major Mackenzie
      {
        road: 'Bathurst St',
        origin: 'Bathurst St & Eglinton Ave W, Toronto, ON',
        destination: 'Bathurst St & Major Mackenzie Dr W, Richmond Hill, ON',
        via: [
          'Bathurst St & Lawrence Ave W, Toronto, ON',
          'Bathurst St & Steeles Ave W, Toronto, ON',
        ],
        fallback: [
          { lat: 43.705, lng: -79.419 },
          { lat: 43.866, lng: -79.463 },
        ],
      },
    ],
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, setMap] = useState<google.maps.Map | null>(null);
  const [snappedPaths, setSnappedPaths] = useState<
    Record<string, google.maps.LatLngLiteral[] | null>
  >({});

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
  });

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    const service = new google.maps.DirectionsService();

    Promise.all(
      REGIONS.map(async (regionConfig) => {
        const edgePaths = await Promise.all(
          regionConfig.boundaryEdges.map((edge) => routeAlongRoad(service, edge)),
        );
        return { id: regionConfig.id, path: edgePaths.flat() };
      }),
    ).then((results) => {
      if (cancelled) return;
      setSnappedPaths(Object.fromEntries(results.map((r) => [r.id, r.path])));
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
      strokeOpacity: 0,
      strokeWeight: 0,
    }),
    [],
  );

  const selectedRegion = REGIONS.find((r) => r.id === selectedId);

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
          {REGIONS.map((regionConfig) => {
            const regionPath = snappedPaths[regionConfig.id] ?? regionConfig.paths;
            const dashedPath =
              regionPath.length > 0 ? [...regionPath, regionPath[0]] : regionPath;
            const dashedLineOptions: google.maps.PolylineOptions = {
              strokeOpacity: 0,
              icons: [
                {
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeColor: regionConfig.color,
                    strokeOpacity: 1,
                    strokeWeight: 3,
                    scale: 3,
                  },
                  offset: '0',
                  repeat: '18px',
                },
              ],
            };

            return (
              <Fragment key={regionConfig.id}>
                <Polygon
                  paths={regionPath}
                  options={{
                    ...polygonOptions,
                    fillColor: regionConfig.color,
                    strokeColor: regionConfig.color,
                  }}
                  onClick={() => setSelectedId(regionConfig.id)}
                />
                <Polyline path={dashedPath} options={dashedLineOptions} />
              </Fragment>
            );
          })}

          {selectedRegion && (
            <InfoWindow
              position={getCenter(selectedRegion.paths)}
              onCloseClick={() => setSelectedId(null)}
            >
              <div style={{ padding: 4, maxWidth: 320 }}>
                <strong>{selectedRegion.name}</strong>
                <br />
                <span style={{ fontSize: 12, color: '#666' }}>{selectedRegion.nameEn}</span>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        <div style={legendContainerStyle}>
          {REGIONS.map((regionConfig) => (
            <div key={regionConfig.id} style={legendItemStyle}>
              <span
                style={{ ...legendColorStyle, borderColor: regionConfig.color }}
              />
              <span style={legendLabelStyle}>{regionConfig.name}</span>
            </div>
          ))}
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
