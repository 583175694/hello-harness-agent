import { useEffect, useMemo, useState } from 'react';
import { Image, type ImageProps, type ImageSourcePropType } from 'react-native';
import { getMobileAuthHeaders } from '@/lib/mobile-auth-api';

function isLocalImageUri(uri: string): boolean {
  return (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library://')
  );
}

export function useAuthedImageSource(
  uri: string | undefined,
): ImageSourcePropType | undefined {
  const [headers, setHeaders] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void getMobileAuthHeaders().then((next) => {
      if (!cancelled) setHeaders(next);
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return useMemo(() => {
    if (!uri) return undefined;
    if (isLocalImageUri(uri)) return { uri };
    return { uri, headers };
  }, [headers, uri]);
}

type AgentAuthedImageProps = Omit<ImageProps, 'source'> & {
  uri?: string;
};

export function AgentAuthedImage({ uri, ...props }: AgentAuthedImageProps) {
  const source = useAuthedImageSource(uri);
  if (!source) return null;
  return <Image source={source} {...props} />;
}
