# 이룸 — 남성 회원 상품 페이지 (배포용)

## 구성

```
index.html                     페이지 본문 (HTML + CSS + JS 한 파일, 53KB)
assets/
  fonts/zenserif.woff2         제목용 세리프 (한글 11,172음절 전부 포함)
  img/
    hero-pc.jpg                히어로 배경 — PC
    hero-mobile.jpg            히어로 배경 — 모바일
    pattern.png                밝은 섹션 배경 패턴
    badge-gold.png             플랜 카드 등급 배지
    profile-1-cat.jpg          프로필 카드 ① 고양이상
    profile-2-firstlove.jpg    프로필 카드 ② 첫사랑상
    profile-3-actress.jpg      프로필 카드 ③ 배우상
    meet-1-cat.jpg             만남 장면 ① (카드 ① 선택 시)
    meet-2-firstlove.jpg       만남 장면 ② (카드 ② 선택 시)
    meet-3-actress.jpg         만남 장면 ③ (기본 / 카드 ③ 선택 시)
    venue.jpg                  레스토랑 컷
  svg/
    logo-black.svg             로고 (밝은 배경용)
    logo-white.svg             로고 (어두운 배경용)
    emblem.svg                 브랜드 엠블럼
    badge.svg                  인증 씰
    seal.svg                   체크 씰
```

총 약 2.2MB.

## 배포 방법

`index.html`과 `assets/` 폴더를 **같은 위치에** 함께 올리면 됩니다.
경로가 모두 상대경로(`assets/...`)라 하위 디렉터리에 넣어도 그대로 동작합니다.

## 주의사항

- **`assets/` 폴더 구조를 바꾸지 마세요.** 파일명·경로가 `index.html` 안에
  하드코딩되어 있습니다. 옮기려면 HTML 안의 `assets/` 문자열을 함께 수정해야 합니다.
- 아이콘(체크 · 카드 · 달력 · 다이아몬드 등)은 **HTML 안에 인라인 SVG**로 들어
  있습니다. 별도 파일이 없으며 색은 CSS `currentColor`를 따라갑니다.
- 외부 CDN·스크립트 의존성이 없습니다. 인터넷 없이도 렌더링됩니다.

## 동작 확인 체크리스트

배포 후 아래가 되는지 봐 주세요.

1. 제목이 세리프로 보이는가 (폰트 로드 확인)
2. 히어로 배경 사진이 보이는가 — PC/모바일 이미지가 다릅니다
3. 프로필 카드 3장이 보이는가
   - PC: 가로 3열 고정
   - 모바일: 좌우 스와이프 + 자동 회전
4. 카드를 누르면 골드 테두리가 생기고 아래 "만남" 구간으로 스크롤되는가
5. 선택한 카드에 따라 만남 이미지가 바뀌는가

## 반응형 기준점

- 모바일: `max-width: 600px`
- PC: `min-width: 601px`
