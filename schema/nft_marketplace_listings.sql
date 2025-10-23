CREATE TABLE IF NOT EXISTS nft_marketplace_listings (
  list_id        INTEGER PRIMARY KEY,                 -- 컨트랙트의 nextListingId 기반
  owner          TEXT    NOT NULL,                    -- 판매자 주소 (0x + 40 hex)
  nft_address    TEXT    NOT NULL,                    -- NFT 컨트랙트 주소
  token_id       TEXT    NOT NULL,                    -- uint256 -> 10진 문자열
  price_wei      TEXT    NOT NULL,                    -- uint256 -> 10진 문자열 (wei)
  status         TEXT    NOT NULL
                       CHECK (status IN ('LISTED','BOUGHT','CANCELLED')),
  -- 정산(구매/취소) 시점에 채워짐
  buyer          TEXT,                                -- 구매자 주소(구매 시)
  tx_listed      TEXT    NOT NULL,                    -- 리스팅 트랜잭션 해시
  tx_settled     TEXT,                                -- 구매/취소 트랜잭션 해시
  block_listed   INTEGER,                             -- 리스팅 포함 블록 번호
  block_settled  INTEGER,                             -- 구매/취소 포함 블록 번호
  ts_listed      INTEGER,                             -- 이벤트 타임스탬프 (초)
  ts_settled     INTEGER
);
