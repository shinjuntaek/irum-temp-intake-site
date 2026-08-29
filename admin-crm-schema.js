(() => {
  "use strict";

  const chips = (options) => ({ control: "chips", options });
  const select = (options) => ({ control: "select", options });
  const text = (placeholder = "") => ({ control: "text", placeholder });
  const textarea = (placeholder = "") => ({ control: "textarea", placeholder });
  const number = (min, max, unit = "") => ({ control: "number", min, max, unit });
  const date = () => ({ control: "date" });
  const field = (id, category, label, stage, key, control, extra = {}) => ({
    id, category, label, stage, group: stage === "primary" ? "primary" : "secondary", key,
    sourceLabel: stage === "primary" ? "1차 신청" : "2차 신청", ...control, ...extra,
  });

  // 1차 원본은 수정하지 않는다. 기존 profile 값은 읽기 전용으로 표시하고, 추가 관리 입력은 correction event로만 남긴다.
  const primary = [
    field("primary-name", "1차 기본정보", "이름", "primary", "name", text(), { locked: true, required: true }),
    field("primary-phone", "1차 기본정보", "연락처", "primary", "phone", text(), { locked: true, required: true }),
    field("primary-birth", "1차 기본정보", "출생연도", "primary", "birthYear", number(1940, 2010, "년"), { locked: true, required: true, aliases: ["birthDate"] }),
    field("primary-gender-female", "1차 기본정보", "성별", "primary", "gender", chips(["male", "female"]), { locked: true, required: true, gender: "female" }),
    field("primary-photos", "1차 기본정보", "최근 사진", "primary", "photos", text(), { locked: true, required: true, kind: "photos" }),
    field("primary-seoul", "1차 기본정보", "서울 만남 가능 여부", "primary", "seoulMeetingAvailability", chips(["Y", "N"]), { aliases: ["seoulAvailable"] }),
    field("primary-region", "1차 기본정보", "거주지역", "primary", "region", text("예: 서울 강남구"), { required: true }),
    field("primary-job", "1차 기본정보", "현재 직업", "primary", "job", text("예: IT 기업 재직 · 의사 · 사업"), { required: true }),
    field("primary-height", "1차 기본정보", "키", "primary", "height", number(130, 230, "cm"), { required: true }),
    field("primary-body-female", "1차 기본정보", "체형", "primary", "bodyType", select(["날씬", "보통", "통통"]), { gender: "female" }),
    field("primary-weight-female", "1차 기본정보", "몸무게", "primary", "bodyWeight", number(30, 150, "kg"), { gender: "female", aliases: ["body_weight"] }),
    field("primary-income", "1차 기본정보", "연소득", "primary", "income", text(), { locked: true, gender: "male" }),
    field("primary-assets", "1차 기본정보", "개인 순자산", "primary", "assets", text("순자산 구간 또는 확인값"), { gender: "male", aliases: ["asset"] }),
    field("primary-education-female", "1차 기본정보", "학력", "primary", "education", text(), { gender: "female" }),
    field("primary-company-female", "1차 기본정보", "직장·사업체", "primary", "company", text(), { gender: "female" }),
    field("primary-mbti-female", "1차 기본정보", "MBTI", "primary", "mbti", text("예: ENFJ"), { gender: "female" }),
    field("primary-appeal-female", "1차 기본정보", "매력 포인트", "primary", "appealPoints", textarea("신청자가 입력한 매력 포인트"), { gender: "female", aliases: ["appeal"] }),
    field("primary-lifestyle-female", "1차 기본정보", "라이프스타일", "primary", "lifestyle", textarea(), { gender: "female" }),
  ];

  const commonSecondary = [
    field("secondary-region", "신원", "거주지역", "secondary", "region", text("예: 서울 강남구"), { required: true }),
    field("secondary-single", "관계", "현재 솔로 여부", "secondary", "singleStatus", chips(["Y", "N"]), { required: true, aliases: ["single"] }),
    field("secondary-marital", "관계", "혼인 이력", "secondary", "maritalStatus", select(["없음", "초혼", "재혼", "이혼", "사별"]), { required: true, aliases: ["marriage"] }),
    field("secondary-children", "관계", "자녀 유무", "secondary", "children", select(["있음", "없음"])),
    field("secondary-smoking", "생활", "흡연", "secondary", "smoking", select(["비흡연", "흡연", "전자담배", "금연중"])),
    field("secondary-drinking", "생활", "음주", "secondary", "drinking", select(["안 함", "가끔", "주1~2", "자주"])),
    field("secondary-religion", "생활", "종교", "secondary", "religion", select(["없음", "기독교", "천주교", "불교", "기타"])),
    field("secondary-tattoo", "생활", "타투", "secondary", "tattoo", select(["없음", "비노출", "노출", "다수"])),
    field("secondary-education", "학력", "최종학력", "secondary", "education", select(["고졸", "전문대 졸업", "4년제 졸업", "석사", "박사"])),
    field("secondary-school", "학력", "학교명", "secondary", "school", text("학교명"), { when: ({ get }) => ["전문대 졸업", "4년제 졸업", "석사", "박사", "대학교 졸업"].includes(String(get("education") || "")) }),
    field("secondary-health-flag", "병력", "병력 여부", "secondary", "healthFlag", chips(["없음", "있음"])),
    field("secondary-health-memo", "병력", "병력 추가 확인 내용", "secondary", "healthMemo", textarea("필요 시 추가 내용을 입력합니다."), { when: ({ get }) => String(get("healthFlag") || "") === "있음" }),
  ];

  const femaleSecondary = [
    ...commonSecondary,
    field("female-job", "직업", "현재 직업", "secondary", "job", text("예: 간호사 · 디자이너 · 사업")),
    field("female-company", "직업", "회사 / 업종", "secondary", "companyIndustry", text("회사 또는 업종"), { aliases: ["company_industry"] }),
    field("female-work", "직업", "근무 형태", "secondary", "workType", select(["정규직", "사업", "프리랜서", "기타"]), { aliases: ["work_type"] }),
    field("female-work-other", "직업", "근무 형태 직접 입력", "secondary", "workTypeOther", text("근무 형태를 입력해 주세요."), { aliases: ["work_type_other", "work_other"], required: true, when: ({ get }) => String(get("workType") || "") === "기타" }),
    field("female-income", "경제", "연소득", "secondary", "incomeFemale", text("연소득 구간 또는 확인값"), { aliases: ["income_female"] }),
    field("female-housemate", "경제", "동거인 여부", "secondary", "housemate", select(["혼자 거주", "가족과 거주", "친구·룸메이트와 거주"])),
    field("female-major", "학력", "전공", "secondary", "major", text("전공")),
    field("female-real-method", "외형", "실물 확인 방식", "secondary", "realCheckMethod", chips(["대면", "화상", "사진"]), { aliases: ["realCheck", "real_check"] }),
    field("female-real-date", "외형", "실물 확인 상세", "secondary", "realCheckDate", date(), { aliases: ["real_check_date"], when: ({ get }) => ["대면", "화상", "대면 확인", "화상 확인"].includes(String(get("realCheckMethod") || "")) }),
    field("female-service", "서비스", "원하는 서비스", "secondary", "serviceSelection", select(["소개", "모임", "둘다"]), { aliases: ["serviceFemale", "service_female"] }),
    field("female-note", "서비스", "추가로 전하고 싶은 내용", "secondary", "femaleNote", textarea("매칭 검토 시 참고할 내용을 입력합니다."), { aliases: ["female_note"] }),
  ];

  const maleSecondary = [
    ...commonSecondary,
    field("male-body", "신원", "체형", "secondary", "bodyType", select(["마른 편", "보통", "슬림탄탄", "근육질", "통통한 편"])),
    field("male-car", "자산", "차량", "secondary", "car", chips(["Y", "N"]), { aliases: ["carOwned"] }),
    field("male-car-model", "자산", "차종", "secondary", "carModel", text("예: BMW 5시리즈 · 2023년식"), { aliases: ["car_model"], inlineWith: "male-car", when: ({ get }) => ["Y", "있음"].includes(String(get("car") || "")) }),
    field("male-housing", "주거", "현재 주거 형태", "secondary", "housing", select(["자가", "전세", "월세", "가족소유"])),
    field("male-job", "직업", "현재 직업", "secondary", "job", text("예: IT 기업 재직 · 의사 · 사업"), { required: true }),
    field("male-company", "직업", "회사 / 기관명", "secondary", "company", text("회사 또는 기관명")),
    field("male-position", "직업", "직급 / 직책", "secondary", "position", text("예: 원장 / 팀장")),
    field("male-employment", "직업", "고용형태", "secondary", "employment", select(["정규직", "사업", "프리랜서", "기타"])),
    field("male-employment-other", "직업", "고용형태 직접 입력", "secondary", "employmentOther", text("고용형태를 입력해 주세요."), { aliases: ["employment_other", "work_other"], required: true, when: ({ get }) => String(get("employment") || "") === "기타" }),
    field("male-income", "소득", "연소득", "secondary", "incomeMale", select(["1억 미만", "1억~2억", "2억~3억", "3억 이상", "기타"]), { required: true, aliases: ["income_male"] }),
    field("male-asset", "자산", "개인 순자산", "secondary", "asset", text("순자산 구간 또는 확인값")),
    field("male-purpose", "가치관", "만남의 목적", "secondary", "purpose", select(["연애", "장기연애", "결혼", "열려있음"]), { required: true }),
    field("male-service", "서비스 니즈", "원하는 서비스 방식", "secondary", "serviceSelection", select(["소개", "모임", "둘다"]), { required: true, aliases: ["serviceMale", "service_male"] }),
    field("male-age-min", "원하는 여성", "실제 허용 연령 최소", "secondary", "preferredAgeMin", number(20, 60, "세"), { aliases: ["age_min"] }),
    field("male-age-max", "원하는 여성", "실제 허용 연령 최고", "secondary", "preferredAgeMax", number(20, 60, "세"), { aliases: ["age_max"] }),
    field("male-height-min", "원하는 여성", "키 범위 최소", "secondary", "preferredHeightMin", number(145, 185, "cm"), { aliases: ["height_min"] }),
    field("male-height-max", "원하는 여성", "키 범위 최고", "secondary", "preferredHeightMax", number(145, 185, "cm"), { aliases: ["height_max"] }),
    field("male-target-tattoo", "원하는 여성", "타투", "secondary", "targetTattoo", select(["필수", "선호", "무관"]), { aliases: ["target_tattoo"] }),
    field("male-target-smoking", "원하는 여성", "흡연", "secondary", "targetSmoking", select(["결격", "무관"]), { aliases: ["target_smoking"] }),
    field("male-target-marriage", "원하는 여성", "결혼 의향", "secondary", "targetMarriage", select(["필수", "무관"]), { aliases: ["target_marriage"] }),
    field("male-doc-deferred", "인증서류", "인증서류 제출 방식", "secondary", "documentDeferred", chips([true, false]), { aliases: ["document_deferred"] }),
    field("male-doc-date", "인증서류", "서류 제출 예정일", "secondary", "documentDueDate", date(), { aliases: ["document_due_date"], required: true, when: ({ get }) => get("documentDeferred") === true || String(get("documentDeferred")) === "true" }),
  ];

  const femalePhone = [
    { key: "femaleImage", label: "주변에서 듣는 이미지", category: "성격", control: "textarea" },
    { key: "femaleAssetAppeal", label: "자산 어필", category: "경제", control: "textarea" },
    { key: "profileCardDisclosure", label: "프로필 카드 공개 가능", category: "서비스", control: "chips", options: ["사진포함", "사진제외", "불가"] },
    { key: "irumMeetingWillingness", label: "우리만 믿고 만나볼 의향", category: "서비스", control: "chips", options: ["Y", "N"] },
    { key: "desiredMaleDescription", label: "자유롭게 원하는 남성 설명", category: "원하는 남성", control: "textarea" },
    { key: "femaleAvoidConditions", label: "절대 피하고 싶은 조건", category: "원하는 남성", control: "tags", max: 3 },
    { key: "healthFollowup", label: "병력 추가 확인 내용", category: "병력", control: "textarea", conditionalHealth: true },
    { key: "phoneMemo", label: "전화상담 메모", category: "상담 메모", control: "textarea" },
  ];

  // 기존 남성 전화상담 revision은 history rail에서 보존한다. 신규 관리자 상세에는 전화상담 확인 목록을 렌더링하지 않는다.
  const malePhone = [];

  const sharedInternal = [
    { key: "consultationAttitude", label: "상담 태도", control: "chips", options: ["정상", "주의", "매우 불량"] },
    { key: "informationConsistency", label: "정보 일관성", control: "chips", options: ["일관", "재확인 필요", "불일치"] },
    { key: "internalMemo", label: "내부평가 메모", control: "textarea" },
  ];

  window.IRUM_CRM_REGISTRY = Object.freeze({
    version: "male-flow-v2-20260828",
    primary,
    secondary: { female: femaleSecondary, male: maleSecondary },
    phone: { female: femalePhone, male: malePhone },
    internal: {
      female: [{ key: "profileRealityGap", label: "프로필과 실물 차이", control: "chips", options: ["차이 거의 없음", "약간 있음", "큼"] }, ...sharedInternal],
      male: [...sharedInternal],
    },
    feedback: {
      intents: [["very_positive", "매우 있음"], ["positive", "있음"], ["unsure", "고민"], ["negative", "없음"]],
      positivePoints: ["대화가 자연스러움", "매너가 좋음", "가치관이 잘 맞음", "외적 호감", "공통 관심사"],
      negativePoints: ["대화가 어려움", "매너가 아쉬움", "가치관 차이", "외적 비선호", "일정·거리 문제", "조건 불일치"],
    },
  });
})();
