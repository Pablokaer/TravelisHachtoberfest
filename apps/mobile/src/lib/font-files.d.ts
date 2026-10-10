// Font files imported as assets (Metro: an asset id; Jest: a stub), like images.
declare module '*.woff2' {
  const asset: number;
  export default asset;
}
