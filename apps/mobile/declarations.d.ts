declare module 'react' {
  export const useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
  export const useState: <T>(initial: T | (() => T)) => [T, (val: T | ((prev: T) => T)) => void];
  export const useCallback: <T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]) => T;
  export const useRef: <T>(initial: T) => { current: T };
  export const useMemo: <T>(factory: () => T, deps?: readonly unknown[]) => T;
  export interface Context<T> {
    Provider: (props: { value: T; children?: any }) => any;
    Consumer: any;
  }
  export const createContext: <T>(defaultValue: T) => Context<T>;
  export const useContext: <T>(context: Context<T> | any) => T;
  export type FC<P = {}> = (props: P) => any;
  export type ReactNode = any;
  const React: {
    useEffect: typeof useEffect;
    useState: typeof useState;
    useCallback: typeof useCallback;
    useRef: typeof useRef;
    useMemo: typeof useMemo;
    createContext: typeof createContext;
    useContext: typeof useContext;
    createElement: (...args: any[]) => any;
    [key: string]: any;
  };
  export default React;
}

declare module 'react-native' {
  export const Text: any;
  export const View: any;
  export const TouchableOpacity: any;
  export const TextInput: any;
  export const ScrollView: any;
  export const KeyboardAvoidingView: any;
  export const ActivityIndicator: any;
  export const SafeAreaView: any;
  export const Platform: {
    OS: 'ios' | 'android' | 'web' | 'windows' | 'macos';
    select: <T>(specifics: { [platform: string]: T }) => T;
  };
  export const Alert: {
    alert: (title: string, message?: string, buttons?: any[], options?: any) => void;
  };
  export const StyleSheet: {
    create: <T extends Record<string, any>>(styles: T) => T;
    [key: string]: any;
  };
  export const AppState: {
    currentState: 'active' | 'background' | 'inactive' | 'unknown' | 'extension';
    addEventListener: (
      type: 'change',
      listener: (state: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') => void,
    ) => { remove: () => void };
  };
  export const NativeModules: {
    UnmuteShareInbox?: {
      read(id: string): Promise<string | null>;
      list(): Promise<string[]>;
      fileUri(id: string, name: string): Promise<string | null>;
      remove(id: string): Promise<void>;
    };
    [key: string]: any;
  };
  export type ViewStyle = any;
  export type TextStyle = any;
  export type ImageStyle = any;
  export type StyleProp<T> = any;
}

declare module 'expo-status-bar' {
  export const StatusBar: any;
}

declare module 'expo-secure-store' {
  export const setItemAsync: (key: string, value: string, options?: any) => Promise<void>;
  export const getItemAsync: (key: string, options?: any) => Promise<string | null>;
  export const deleteItemAsync: (key: string, options?: any) => Promise<void>;
  export const isAvailableAsync: () => Promise<boolean>;
}

declare module 'expo-router' {
  export const useRouter: () => {
    push: (href: string) => void;
    replace: (href: string) => void;
    back: () => void;
  };
  export const useSegments: () => string[];
  export const useLocalSearchParams: <
    T extends Record<string, string | string[] | undefined> = Record<string, string | string[]>,
  >() => T;
  export const Slot: any;
  export const Stack: any;
  export const Tabs: any;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
