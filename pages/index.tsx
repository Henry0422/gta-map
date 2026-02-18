import { useCallback, useMemo, useState } from 'react';
import { GoogleMap, Polygon, InfoWindow, useLoadScript } from '@react-google-maps/api';
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

const region: Region = {
  id: 'mccowan-bathurst-elgin-eglinton',
  name: 'McCowan Rd以东 · Elgin Mills Rd以南 · Bathurst St以东 · Eglinton Ave以南',
  nameEn: 'East of McCowan, South of Elgin Mills, East of Bathurst, South of Eglinton',
  color: '#E74C3C',
  paths: [
    { lat: 43.88, lng: -79.44 },
    { lat: 43.88, lng: -79.25 },
    { lat: 43.705, lng: -79.25 },
    { lat: 43.705, lng: -79.44 },
  ],
};

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

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
  });

  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const polygonOptions = useMemo(
    () => ({
      fillOpacity: 0.3,
      strokeOpacity: 0.8,
      strokeWeight: 2,
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
            paths={region.paths}
            options={{
              ...polygonOptions,
              fillColor: region.color,
              strokeColor: region.color,
            }}
            onClick={() => setSelected(true)}
          />

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
            <span style={{ ...legendColorStyle, backgroundColor: region.color }} />
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
};

const legendLabelStyle: React.CSSProperties = {
  fontSize: 13,
};
