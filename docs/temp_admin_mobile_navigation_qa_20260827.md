# 임시 관리자 모바일 전체 메뉴 QA

- **Viewport:** 390×844 기준이며 전체 페이지 capture에서도 drawer가 viewport에 고정된다.
- **검증 화면:** `/admin/` 신청자 상세 fixture
- **결과:** 상단 햄버거에서 기존 sidebar의 전체 운영 메뉴를 재사용하는 drawer가 열린다.
- **시각 확인:** 현재 메뉴 `신청자`가 active 상태와 `aria-current="page"`로 표시되며, 대시보드·신청자·회원·1:1 매칭·프라이빗 소셜·Host 유입 검수·할 일·통계·관리자·감사 로그·설정·로그아웃을 확인할 수 있다.
- **동작 확인:** 닫기 버튼 focus, body scroll lock, overlay/ESC/메뉴 선택 닫기, trigger focus 복귀가 Chromium fixture에서 통과했다.
- **회귀 확인:** 5영역 신청자 상세, private 사진·서류, 2차 링크·수동 발송, 독립 필터, 소셜 일정과 390px 가로 overflow 없음이 유지된다.

fixture 기반 검증으로 운영 Supabase 데이터는 변경하지 않았다.
