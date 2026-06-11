import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleMap,
  Marker,
  Polygon,
  Polyline,
  InfoWindow,
  useLoadScript,
} from '@react-google-maps/api';
import Head from 'next/head';
import { Copy } from 'lucide-react';

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

// 区域由四条主干道围成。`paths` 仅为粗略顶点，用于地图加载时的占位与图例定位。
// 真正的边界通过对下方 `boundaryEdges` 中的路口名称进行路由，将路径吸附到道路上获得。
const REGIONS: Region[] = [
  {
    id: 'dufferin-markham-elgin-mills-eglinton',
    name: '满$100免费配送范围',
    nameEn: 'Free delivery range for orders over $100',
    color: '#3498DB',
    paths: [
      { lat: 43.897, lng: -79.489 }, // 西北角 Dufferin St × Teston Rd（Elgin Mills 西向延伸）
      { lat: 43.917, lng: -79.262 }, // 东北角 Markham Rd × Elgin Mills Rd
      { lat: 43.735, lng: -79.26 }, // 东南角 Markham Rd × Eglinton Ave E
      { lat: 43.696, lng: -79.450 }, // 西南角 Dufferin St × Eglinton Ave W
    ],
    boundaryEdges: [
      // 北边：Eglin Mills Rd，从 Bathurst 向东到 McCowan Rd
      {
        road: 'Elgin Mills Rd',
        origin: 'Bathurst St & Elgin Mills Rd, Richmond Hill, ON',
        destination: 'McCowan Rd & Elgin Mills Rd E, Markham, ON',
        via: [
          'Yonge St & Elgin Mills Rd E, Richmond Hill, ON',
          'Bayview Ave & Elgin Mills Rd E, Richmond Hill, ON',
          'Leslie St & Elgin Mills Rd E, Richmond Hill, ON',
          // 'Woodbine Ave & Elgin Mills Rd E, Markham, ON',
          'Warden Ave & Elgin Mills Rd E, Markham, ON',
          'McCowan Rd & Elgin Mills Rd E, Markham, ON',
        ],
        fallback: [
          { lat: 43.8793, lng: -79.4917 },
          { lat: 43.90, lng: -79.26 },
        ],
      },
      {
        road: 'McCowan Rd',
        origin: 'McCowan Rd & Elgin Mills Rd E, Markham, ON',
        destination: 'McCowan Rd & 16th Ave, Markham, ON',
        via: [
        ],
        fallback: [],
      },
      // 东边：Markham Rd，从 Elgin Mills 向南到 Eglinton
      {
        road: 'Markham Rd',
        origin: 'Markham Rd & 16th Ave, Markham, ON',
        destination: 'Markham Rd & Eglinton Ave E, Scarborough, ON',
        via: [
          // 'Markham Rd & Major Mackenzie Dr E, Markham, ON',
          'Markham Rd & Highway 7, Markham, ON',
          'Markham Rd & Steeles Ave E, Toronto, ON',
          'Markham Rd & Lawrence Ave E, Toronto, ON',
        ],
        fallback: [
          { lat: 43.94, lng: -79.26 },
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
          { lat: 43.696, lng: -79.450 },
        ],
      },
     // 西边：Dufferin St，从 Eglinton 向北到 Rutherford Rd
      {
        road: 'Dufferin St',
        origin: 'Dufferin St & Eglinton Ave W, Toronto, ON',
        destination: 'Dufferin St & Rutherford Rd, Vaughan, ON',
        via: [
          'Dufferin St & Lawrence Ave W, Toronto, ON',
          'Dufferin St & Sheppard Ave W, Toronto, ON',
          'Dufferin St & Finch Ave W,Toronto, ON',
          'Dufferin St & Centre St, Toronto, ON',
          'Dufferin St & Rutherford Rd, Vaughan, ON',
        ],
        fallback: [
          { lat: 43.696, lng: -79.450 },
          { lat: 43.897, lng: -79.489 },
        ],
      },
      {
        road: 'Bathurst St',
        origin: 'Bathurst St & Carrville Rd, Vaughan, ON',
        destination: 'Bathurst St & Major Mackenzie Dr, Richmond Hill, ON',
        via: [
          '43.849195, -79.459030',
          'Bathurst St & Major Mackenzie Dr, Richmond Hill, ON',
        ],
        fallback: [
          { lat: 43.866, lng: -79.463 },
          { lat: 43.903, lng: -79.293 },
        ],
      },
    ],
  },
  {
    id: 'mccowan-bathurst-major-mackenzie-eglinton',
    name: '满$80免费配送范围',
    nameEn: 'Free delivery range for orders over $80',
    color: '#e7773c',
    paths: [
      { lat: 43.866, lng: -79.463 }, // 西北角 Bathurst St × Major Mackenzie Dr
      { lat: 43.903, lng: -79.293 }, // 东北角 McCowan Rd × Major Mackenzie Dr
      { lat: 43.735, lng: -79.25 }, // 东南角 McCowan Rd × Eglinton Ave E
      { lat: 43.705, lng: -79.419 }, // 西南角 Bathurst St × Eglinton Ave W
    ],
    boundaryEdges: [
      // 北边：Major Mackenzie Dr，从 Yonge St 向东到 Kennedy Rd
      {
        road: 'Major Mackenzie Dr',
        origin: 'Yonge St & Major Mackenzie Dr W, Richmond Hill, ON',
        destination: 'Kennedy Rd & Major Mackenzie Dr E, Markham, ON',
        via: [
          'Yonge St & Major Mackenzie Dr, Richmond Hill, ON',
          'Warden Ave & Major Mackenzie Dr E, Markham, ON',
        ],
        fallback: [
          { lat: 43.866, lng: -79.463 },
          { lat: 43.903, lng: -79.293 },
        ],
      },
      // 额外添加一条路：Kennedy Rd 从 Major Mackenzie 向南到 Highway 7，补齐北边边界的缺口
      {
        road: 'Kennedy Rd',
        origin: 'Kennedy Rd & Major Mackenzie Dr E, Markham, ON',
        destination: 'Kennedy Rd & Highway 7, Toronto, ON',
        via: [
        ],
        fallback: [],
      },
      // 东边：McCowan Rd，从 Highway 7 向南到 Eglinton
      {
        road: 'McCowan Rd',
        origin: 'McCowan Rd & Highway 7, Markham, ON',
        destination: 'Danforth Rd & Eglinton Ave E, Scarborough, ON',
        via: [
          'McCowan Rd & Ellesmere Rd, Toronto, ON',
          'McCowan Rd & Lawrence Ave E, Toronto, ON',
        ],
        fallback: [
          { lat: 43.903, lng: -79.293 },
          { lat: 43.735, lng: -79.25 },
        ],
      },
      // 南边：Eglinton Ave，从 Danforth Rd 向西到 Bathurst
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
      // 西边：Bathurst St，从 Eglinton 向北到 Highway 7
      {
        road: 'Bathurst St',
        origin: 'Bathurst St & Eglinton Ave W, Toronto, ON',
        destination: 'Bathurst St & Highway 7, Thornhill, ON',
        via: [
          'Bathurst St & Lawrence Ave W, Toronto, ON',
          'Bathurst St & Wilson Ave, Toronto, ON',
          'Bathurst St & Charleswood Dr, Toronto, ON',
          'Bathurst St & Alliham Gradens, Toronto, ON',
          '43.742781, -79.435363',
          'Bathurst St & York Downs Dr, Toronto, ON',
          '43.750772, -79.437301',
          'Bathurst St & Alexis Blvd, Toronto, ON',
          '43.758647, -79.439229',
          '43.762549, -79.440188',
          'Bathurst St & Finch Ave W,Toronto, ON',
          'Bathurst St & Steeles Ave W, Toronto, ON',
          'Bathurst St & Clark Ave W, Vaughan, ON',
        ],
        fallback: [
          { lat: 43.705, lng: -79.419 },
          { lat: 43.866, lng: -79.463 },
        ],
      },
      // 额外添加一条路：Yonge St 从 Major Mackenzie 向北到 Major Mackenzie Dr, 补齐北边边界的缺口
      {
        road: 'Yonge St',
        origin: 'Yonge St & Connector Rd, Richmond Hill, ON',
        destination: 'Yonge St & Major Mackenzie Dr, Richmond Hill, ON',
        via: [
          'Yonge St & 16th Ave, Richmond Hill, ON',
        ],
        fallback: [
          { lat: 43.758, lng: -79.439 },
          { lat: 43.866, lng: -79.463 },
        ],
      },
    ],
  },
];

interface POI {
  id: string;
  name: string;
  address: string;
}

// 需要在地图上标记的兴趣点。坐标通过 Google Maps Geocoder 在运行时解析，不硬编码经纬度。
const POIS: POI[] = [
  {
    id: 'main ',
    name: '主自提点',
    address: '188 Fairview Mall Dr, North York, ON M2J 5A7',
  },
  {
    id: 'whole-foods-markham',
    name: 'Whole Foods Market 满$80自提点',
    address: '3997 Hwy 7, Markham, ON L3R 5M6',
  },
  {
    id: 'bank-of-china-markham',
    name: 'Bank of China 满$80自提点 (Hwy 7 & Leslie)',
    address: '1 Bank of China Way, Markham, ON L3T 0E2',
  },
  {
    id: 'home-depot-richmond-hill',
    name: 'Home Depot 满$80自提点',
    address: '50 Red Maple Rd, Richmond Hill, ON L4B 4K1',
  },
  {
    id: 'Walmart-richmond-hill',
    name: 'Walmart 满$100自提点',
    address: '1070 Major Mackenzie Dr E, Richmond Hill, ON L4S 1P3',
  }
];

// 使用 Google Maps DirectionsService 将边界路段吸附到真实道路。
// 使用路口名称作为起点/终点/途经点，禁用高速和渡轮，保证路径沿指定主干道且保留弯曲。
function routeAlongRoad(
  service: google.maps.DirectionsService,
  edge: BoundaryEdge,
): Promise<google.maps.LatLngLiteral[]> {
  return new Promise((resolve) => {
// 规范化并去重途经点：移除与 origin/destination 相同或重复的项
    const originStr = String(edge.origin).trim();
    const destinationStr = String(edge.destination).trim();
    const filteredWaypoints = (edge.via || [])
      .map((loc) => loc.trim())
      .filter((loc, idx, arr) => loc && loc !== originStr && loc !== destinationStr && arr.indexOf(loc) === idx)
      .map((location) => ({ location, stopover: false }));

    service.route(
      {
        origin: edge.origin,
        destination: edge.destination,
        waypoints: filteredWaypoints,
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
          // 若路由失败，则回退到 edge.fallback 指定的直线端点
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
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  zoomControl: true,
  mapTypeId: 'roadmap',
  tilt: 0,
  rotateControl: false,
};

export default function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [, setMap] = useState<google.maps.Map | null>(null);
  const [snappedPaths, setSnappedPaths] = useState<
    Record<string, google.maps.LatLngLiteral[] | null>
  >({});
  const [poiPositions, setPoiPositions] = useState<
    Record<string, google.maps.LatLngLiteral | null>
  >({});
  const [copiedPoiId, setCopiedPoiId] = useState<string | null>(null);

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

  // 使用 Google Maps Geocoder 将 POI 地址解析为坐标，避免硬编码经纬度
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    const geocoder = new google.maps.Geocoder();

    POIS.forEach((poi) => {
      geocoder.geocode({ address: poi.address }, (results, status) => {
        if (cancelled) return;
        if (status === google.maps.GeocoderStatus.OK && results?.[0]?.geometry?.location) {
          const loc = results[0].geometry.location;
          setPoiPositions((prev) => ({
            ...prev,
            [poi.id]: { lat: loc.lat(), lng: loc.lng() },
          }));
        } else {
          console.warn(`Geocoding failed for "${poi.name}" (${poi.address}): ${status}`);
        }
      });
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

  const handleCopyAddress = useCallback(async (address: string, id: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(address);
      } else {
        const el = document.createElement('textarea');
        el.value = address;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        try {
          el.select();
          document.execCommand('copy');
        } finally {
          document.body.removeChild(el);
        }
      }
      setCopiedPoiId(id);
    } catch (err) {
      console.error('Failed to copy address', err);
    }
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
  const selectedPoi = POIS.find((p) => p.id === selectedPoiId);
  const selectedPoiPos = selectedPoiId ? poiPositions[selectedPoiId] : null;

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
                  onClick={() => {
                    setSelectedPoiId(null);
                    setSelectedId(regionConfig.id);
                  }}
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

          {/* POI 标记：通过 Geocoder 解析地址得到坐标，点击显示名称和地址 */}
          {POIS.map((poi) => {
            const pos = poiPositions[poi.id];
            if (!pos) return null;
            return (
              <Marker
                key={poi.id}
                position={pos}
                title={poi.name}
                onClick={() => {
                  setSelectedId(null);
                  setSelectedPoiId(poi.id);
                }}
                icon={{
                  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">' +
                    '<path d="M16 0C7.164 0 0 7.164 0 16c0 12 16 24 16 24s16-12 16-24C32 7.164 24.836 0 16 0z" fill="#E74C3C"/>' +
                    '<circle cx="16" cy="15" r="6" fill="white"/>' +
                    '</svg>'
                  ),
                  scaledSize: new google.maps.Size(28, 35),
                  anchor: new google.maps.Point(14, 35),
                }}
              />
            );
          })}

          {selectedPoi && selectedPoiPos && (
            <InfoWindow
              position={selectedPoiPos}
              onCloseClick={() => setSelectedPoiId(null)}
            >
              <div style={{ padding: 4, maxWidth: 280 }}>
                <strong style={{ fontSize: 16 }}>{selectedPoi.name}</strong>
                <br />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 14, color: '#555', overflowWrap: 'break-word', flex: 1 }}>
                    {selectedPoi.address}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyAddress(selectedPoi.address, selectedPoi.id)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                    aria-label="copy address"
                    title="copy address"
                  >
                    <Copy size={16} />
                  </button>
                </div>
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
