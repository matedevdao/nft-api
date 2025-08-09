INSERT INTO nfts (
  nft_address,
  token_id,
  holder,
  style,
  parts,
  dialogue,
  image
) VALUES (
  '0x7340a44AbD05280591377345d21792Cdc916A388', -- sigor-sparrows 컨트랙트 주소
  6,
  '0xbB22b6F3CE72A5Beb3CC400d9b6AF808A18E0D4c',
  'Illustration', -- traits.Style
  '{"Background":"White","Tail":"Duck","Body":"Dark brown","Back":"Cracked egg","Eye":"Heart","Beak":"Penguin","Shoes":"2didas","Text Balloon":"Innermost feelings","Wings":"None"}',
  '금새', -- traits.Dialogue
  '2f7390d1-7fe4-46a0-9424-9becf0fab427.png' -- 파일명만 저장하는 기존 패턴일 경우
);
