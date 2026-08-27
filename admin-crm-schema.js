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

  const primary = [
    field("primary-name", "1차 기본정보", "이름", "primary", "name", text(), { locked: true, required: true }),
    field("primary-phone", "1차 기본정보", "연락처", "primary", "phone", text(), { locked: true, required: true }),
    field("primary-birth", "1차 기본정보", "출생연도", "primary", "birthYear", number(1940, 2010, "년"), { locked: true, required: true, aliases: ["birthDate"] }),
    field("primary-gender", "1차 기본정보", "성별", "primary", "gender", chips(["male", "female"]), { locked: true, required: true }),
    field("primary-region", "1차 기본정보", "거주지역", "primary", "region", text("예: 서울 강남구"), { required: true }),
    field("primary-job", "1차 기본정보", "현재 직업", "primary", "job", text("예: 브랜드 마케터"), { required: true }),
    field("primary-height", "1차 기본정보", "키", "primary", "height", number(130, 230, "cm"), { required: true }),
    field("primary-body", "1차 기본정보", "체형", "primary", "bodyType", select(["슬림", "보통", "탄탄", "근육형", "통통"])),
    field("primary-education", "1차 기본정보", "학력", "primary", "education", text()),
    field("primary-company", "1차 기본정보", "직장·사업체", "primary", "company", text()),
    field("primary-mbti", "1차 기본정보", "MBTI", "primary", "mbti", text("예: ENFJ")),
    field("primary-appeal", "1차 기본정보", "매력 포인트", "primary", "appealPoints", textarea("신청자가 입력한 매력 포인트"), { aliases: ["appeal"] }),
    field("primary-lifestyle", "1차 기본정보", "라이프스타일", "primary", "lifestyle", textarea()),
  ];

  const commonSecondary = [
    field("secondary-region", "관계·신원", "거주지역", "secondary", "region", text("예: 서울 강남구"), { required: true }),
    field("secondary-single", "관계·신원", "현재 솔로 여부", "secondary", "singleStatus", chips(["예", "아니오"]), { required: true, aliases: ["single"] }),
    field("secondary-marital", "관계·신원", "혼인 이력", "secondary", "maritalStatus", select(["없음", "초혼", "재혼", "이혼", "사별"]), { required: true, aliases: ["marriage"] }),
    field("secondary-children", "관계·신원", "자녀 유무", "secondary", "children", chips(["없음", "있음"])),
    field("secondary-smoking", "생활정보", "흡연", "secondary", "smoking", chips(["비흡연", "흡연", "전자담배"])),
    field("secondary-drinking", "생활정보", "음주", "secondary", "drinking", select(["안함", "가끔", "주 1~2회", "자주"])),
    field("secondary-religion", "생활정보", "종교", "secondary", "religion", select(["무교", "기독교", "천주교", "불교", "기타"])),
    field("secondary-tattoo", "생활정보", "타투", "secondary", "tattoo", chips(["없음", "비노출", "노출"])),
    field("secondary-education", "학력", "최종학력", "secondary", "education", select(["고등학교 졸업", "전문대 졸업", "대학교 졸업", "석사", "박사"])),
    field("secondary-school", "학력", "학교명", "secondary", "school", text("학교명"), { when: ({ get }) => ["전문대 졸업", "대학교 졸업", "석사", "박사"].includes(String(get("education") || "")) }),
    field("secondary-health-flag", "건강·동의", "건강 및 병력 관련 특이사항 여부", "secondary", "healthFlag", chips(["없음", "있음"])),
    field("secondary-health-memo", "건강·동의", "건강 및 병력 관련 추가 설명", "secondary", "healthMemo", textarea("상담 중 고려가 필요한 내용을 입력합니다."), { when: ({ get }) => String(get("healthFlag") || "") === "있음" }),
  ];

  const femaleSecondary = [
    ...commonSecondary,
    field("female-job", "직업·경제", "현재 직업", "secondary", "job", text("예: 브랜드 마케터")),
    field("female-company", "직업·경제", "회사 / 업종", "secondary", "companyIndustry", text("예: IT / 마케팅"), { aliases: ["company_industry"] }),
    field("female-work", "직업·경제", "근무 형태", "secondary", "workType", chips(["직장인", "사업", "프리랜서", "기타"]), { aliases: ["work_type"] }),
    field("female-work-other", "직업·경제", "근무 형태 직접 입력", "secondary", "workTypeOther", text("근무 형태를 입력해 주세요."), { aliases: ["work_type_other", "work_other"], required: true, when: ({ get }) => String(get("workType") || "") === "기타" }),
    field("female-income", "직업·경제", "연소득", "secondary", "incomeFemale", select(["3천만원 미만", "3천~5천만원", "5천~8천만원", "8천만원 이상"]), { aliases: ["income_female"] }),
    field("female-real-method", "실물 확인", "실물 확인 방식", "secondary", "realCheckMethod", chips(["대면 확인", "화상 확인"]), { required: true, aliases: ["realCheck", "real_check"] }),
    field("female-real-date", "실물 확인", "희망 확인일", "secondary", "realCheckDate", date(), { required: true, aliases: ["real_check_date"] }),
    field("female-housemate", "생활정보", "동거인 여부", "secondary", "housemate", select(["혼자", "가족", "기타"])),
    field("female-major", "학력", "전공", "secondary", "major", text("전공")),
    field("female-service", "서비스", "원하는 서비스", "secondary", "serviceSelection", chips(["1:1 소개", "모임", "둘 다"]), { required: true, aliases: ["serviceFemale", "service_female"] }),
    field("female-note", "서비스", "추가로 전하고 싶은 내용", "secondary", "femaleNote", textarea("매칭 검토 시 참고할 내용을 입력합니다."), { aliases: ["female_note"] }),
  ];

  const maleSecondary = [
    ...commonSecondary,
    field("male-body", "생활정보", "체형", "secondary", "bodyType", chips(["슬림", "보통", "탄탄", "근육형"]), { aliases: ["bodytype"] }),
    field("male-car", "생활정보", "차량", "secondary", "car", chips(["있음", "없음"])),
    field("male-car-model", "생활정보", "차량 차종", "secondary", "carModel", text("예: 중형 세단"), { aliases: ["car_model"], when: ({ get }) => String(get("car") || "") === "있음" }),
    field("male-car-year", "생활정보", "차량 연식", "secondary", "carYear", number(1980, 2100, "년"), { aliases: ["car_year"], when: ({ get }) => String(get("car") || "") === "있음" }),
    field("male-housing", "생활정보", "현재 주거 형태", "secondary", "housing", select(["자가", "전세", "월세", "가족소유"])),
    field("male-job", "직업·소득·자산", "현재 직업", "secondary", "job", text("예: 정형외과 전문의"), { required: true }),
    field("male-company", "직업·소득·자산", "회사 / 기관명", "secondary", "company", text("예: OO병원")),
    field("male-position", "직업·소득·자산", "직급 / 직책", "secondary", "position", text("예: 원장 / 팀장")),
    field("male-employment", "직업·소득·자산", "근무 형태", "secondary", "employment", select(["정규직", "계약직", "사업자", "프리랜서", "기타"])),
    field("male-employment-other", "직업·소득·자산", "근무 형태 직접 입력", "secondary", "employmentOther", text("근무 형태를 입력해 주세요."), { aliases: ["employment_other", "work_other"], required: true, when: ({ get }) => String(get("employment") || "") === "기타" }),
    field("male-income", "직업·소득·자산", "연소득", "secondary", "incomeMale", select(["5천만원 미만", "5천~8천만원", "8천~1억원", "1억~1.5억원", "1.5억~2억원", "2억원 이상"]), { required: true, aliases: ["income_male"] }),
    field("male-asset", "직업·소득·자산", "개인 순자산", "secondary", "asset", select(["1억원 미만", "1~3억원", "3~5억원", "5~10억원", "10억원 이상"]), { required: true }),
    field("male-purpose", "가치관·서비스", "만남의 목적", "secondary", "purpose", chips(["연애", "장기연애", "결혼", "열려있음"]), { required: true }),
    field("male-service", "가치관·서비스", "원하는 서비스 방식", "secondary", "serviceSelection", chips(["1:1 소개", "모임", "둘 다"]), { required: true, aliases: ["serviceMale", "service_male"] }),
    field("male-age-min", "원하는 여성", "선호 최소 연령", "secondary", "preferredAgeMin", number(20, 60, "세"), { aliases: ["age_min"] }),
    field("male-age-max", "원하는 여성", "선호 최대 연령", "secondary", "preferredAgeMax", number(20, 60, "세"), { aliases: ["age_max"] }),
    field("male-height-min", "원하는 여성", "선호 최소 키", "secondary", "preferredHeightMin", number(140, 200, "cm"), { aliases: ["height_min"] }),
    field("male-height-max", "원하는 여성", "선호 최대 키", "secondary", "preferredHeightMax", number(140, 200, "cm"), { aliases: ["height_max"] }),
    field("male-target-tattoo", "원하는 여성", "선호 여성의 타투 기준", "secondary", "targetTattoo", chips(["타투 없음 필수", "타투 없음 선호", "무관"]), { aliases: ["target_tattoo"] }),
    field("male-target-smoking", "원하는 여성", "선호 여성의 흡연 기준", "secondary", "targetSmoking", chips(["비흡연 필수", "무관"]), { aliases: ["target_smoking"] }),
    field("male-target-marriage", "원하는 여성", "선호 여성의 결혼 의향", "secondary", "targetMarriage", chips(["결혼 의향 필수", "무관"]), { aliases: ["target_marriage"] }),
    field("male-doc-deferred", "인증서류", "인증서류 제출 방식", "secondary", "documentDeferred", chips([true, false]), { aliases: ["document_deferred"] }),
    field("male-doc-date", "인증서류", "서류 제출 예정일", "secondary", "documentDueDate", date(), { aliases: ["document_due_date"], required: true, when: ({ get }) => get("documentDeferred") === true || String(get("documentDeferred")) === "true" }),
  ];

  const femalePhone = [
    { key: "femaleImage", label: "주변에서 듣는 이미지", control: "textarea" },
    { key: "femaleAssetAppeal", label: "자산 어필", control: "textarea" },
    { key: "profileCardDisclosure", label: "프로필 카드 공개 가능 여부", control: "chips", options: ["사진 포함", "사진 제외", "공개 불가"] },
    { key: "irumMeetingWillingness", label: "이룸을 믿고 만나볼 의향", control: "textarea" },
    { key: "desiredMaleDescription", label: "원하는 남성에 대한 자유 설명", control: "textarea" },
    { key: "femaleAvoidConditions", label: "절대 피하고 싶은 조건", control: "tags", max: 3 },
    { key: "healthFollowup", label: "병력 추가 확인 내용", control: "textarea", conditionalHealth: true },
    { key: "phoneMemo", label: "전화상담 메모", control: "textarea" },
  ];

  const malePhone = [
    { key: "maleJobConfirmed", label: "현재 직업 사실 확인", control: "chips", options: ["확인", "재확인 필요"] },
    { key: "maleIncomeConfirmed", label: "연소득 사실 확인", control: "chips", options: ["확인", "재확인 필요"] },
    { key: "maleAssetConfirmed", label: "개인 순자산 사실 확인", control: "chips", options: ["확인", "재확인 필요"] },
    { key: "maleHousingConfirmed", label: "주거 형태 사실 확인", control: "chips", options: ["확인", "재확인 필요"] },
    { key: "maleEducationConfirmed", label: "학력 사실 확인", control: "chips", options: ["확인", "재확인 필요"] },
    { key: "maleMarriagePurposeConfirmed", label: "만남 목적 사실 확인", control: "chips", options: ["확인", "재확인 필요"] },
    { key: "malePreferredAgeConfirmed", label: "선호 연령 범위 확인", control: "chips", options: ["확인", "재확인 필요"] },
    { key: "malePreferredHeightConfirmed", label: "선호 키 범위 확인", control: "chips", options: ["확인", "재확인 필요"] },
    { key: "healthFollowup", label: "병력 추가 확인 내용", control: "textarea", conditionalHealth: true },
    { key: "phoneMemo", label: "전화상담 메모", control: "textarea" },
  ];

  const sharedInternal = [
    { key: "consultationAttitude", label: "상담 태도", control: "chips", options: ["정상", "주의", "매우 불량"] },
    { key: "informationConsistency", label: "정보 일관성", control: "chips", options: ["일관", "재확인 필요", "불일치"] },
    { key: "internalMemo", label: "내부평가 메모", control: "textarea" },
  ];

  window.IRUM_CRM_REGISTRY = Object.freeze({
    version: "pasted-content-789-20260827-1",
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
