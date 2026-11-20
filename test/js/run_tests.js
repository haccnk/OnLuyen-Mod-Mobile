const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createTestEnvironment, el } = require("./mock_dom.js");

const EXTRACTOR_SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "assets", "js", "dom_extractor_mobile.js"),
  "utf8"
);
const AGENT_SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "assets", "js", "mobile_agent.js"),
  "utf8"
);

function loadModulesInEnv(env, bridgeHandler = null) {
  const sandbox = {
    ...env,
    window: env,
    globalThis: env,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    Promise,
    Map,
    Set,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Math,
    JSON,
    parseInt,
    parseFloat,
    decodeURIComponent,
    encodeURIComponent
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  if (bridgeHandler) {
    sandbox.__MockFlutterBridge = bridgeHandler;
  }

  vm.createContext(sandbox);
  vm.runInContext(EXTRACTOR_SRC, sandbox, { filename: "dom_extractor_mobile.js" });
  vm.runInContext(AGENT_SRC, sandbox, { filename: "mobile_agent.js" });

  return {
    EXT: sandbox.__OnLuyenExtractor,
    AGENT: sandbox.__OnLuyenMobileAgent,
    sandbox
  };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// =========================================================================
// 13 BÀI TEST HỌC THUẬT KẾ THỪA TỪ ULTRA
// =========================================================================
test("1. KaTeX đọc 1 lần qua annotation x-tex (không lặp katex-html)", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const katex = el(doc, "span", { className: "katex" }, [
    el(doc, "span", { className: "katex-mathml" }, [
      el(doc, "math", {}, [
        el(doc, "semantics", {}, [
          el(doc, "annotation", { attrs: { encoding: "application/x-tex" }, text: "\\frac{1}{2}" })
        ])
      ])
    ]),
    el(doc, "span", { className: "katex-html", attrs: { "aria-hidden": "true" }, text: "12" })
  ]);
  const root = el(doc, "div", {}, ["Giá trị ", katex, " bằng"]);
  const out = EXT.serializeAcademicDOM(root);
  assert.strictEqual(out, "Giá trị $\\frac{1}{2}$ bằng");
});

test("2. MathML -> LaTeX (phân số, căn bậc hai, số mũ, vectơ)", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const math = el(doc, "math", {}, [
    el(doc, "mover", {}, [
      el(doc, "mi", { text: "AB" }),
      el(doc, "mo", { text: "→" })
    ]),
    el(doc, "mo", { text: "+" }),
    el(doc, "mfrac", {}, [
      el(doc, "msqrt", {}, [el(doc, "mi", { text: "x" })]),
      el(doc, "msup", {}, [el(doc, "mi", { text: "y" }), el(doc, "mn", { text: "2" })])
    ])
  ]);
  const tex = EXT.mathMLToLatex(math).trim();
  assert.strictEqual(tex, "\\vec{AB}+\\frac{\\sqrt{x}}{{y}^{2}}");
});

test("3. MathJax không đọc trùng mjx-assistive-mml", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const mjx = el(doc, "mjx-container", {}, [
    el(doc, "mjx-math", { text: "visual" }),
    el(doc, "mjx-assistive-mml", {}, [
      el(doc, "math", {}, [el(doc, "mi", { text: "x" }), el(doc, "mo", { text: "=" }), el(doc, "mn", { text: "5" })])
    ])
  ]);
  const out = EXT.serializeAcademicDOM(el(doc, "p", {}, ["Giải ", mjx]));
  assert.strictEqual(out, "Giải $x=5$");
});

test("4. Tiếng Anh gộp thẻ gạch chân liền kề [GẠCH_CHÂN: ...] + border-bottom", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const word = el(doc, "span", {}, [
    "b",
    el(doc, "u", { text: "e" }),
    el(doc, "u", { text: "a" }),
    "d and ",
    el(doc, "span", { cs: { borderBottomStyle: "solid", borderBottomWidth: "2px" }, text: "th" }),
    "is"
  ]);
  const out = EXT.serializeAcademicDOM(word);
  assert.strictEqual(out, "b[GẠCH_CHÂN: ea]d and [GẠCH_CHÂN: th]is");
});

test("5. Bảng số liệu Markdown (không nhầm với bảng Đúng/Sai)", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const table = el(doc, "table", {}, [
    el(doc, "tr", {}, [el(doc, "th", { text: "x" }), el(doc, "th", { text: "1" }), el(doc, "th", { text: "2" })]),
    el(doc, "tr", {}, [el(doc, "td", { text: "f(x)" }), el(doc, "td", { text: "3" }), el(doc, "td", { text: "7" })])
  ]);
  const out = EXT.serializeAcademicDOM(el(doc, "div", {}, ["Cho bảng:", table]));
  assert.ok(out.includes("| x | 1 | 2 |"));
  assert.ok(out.includes("| f(x) | 3 | 7 |"));
});

test("6. Đúng/Sai Chiến lược A: bỏ thead & tự ánh xạ cột đảo (Sai | Đúng)", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const rows = [
    el(doc, "tr", {}, [el(doc, "th", { text: "Mệnh đề" }), el(doc, "th", { text: "Sai" }), el(doc, "th", { text: "Đúng" })])
  ];
  const thead = el(doc, "thead", {}, [rows[0]]);
  const tbody = el(doc, "tbody", {});
  const trueBtns = [];
  const falseBtns = [];
  ["a) 1+1=2", "b) 2+2=5", "c) 3>1", "d) 0>5"].forEach((txt, i) => {
    const fRadio = el(doc, "input", { type: "radio", rect: { top: 200 + i * 50, left: 200, width: 20, height: 20 } });
    const tRadio = el(doc, "input", { type: "radio", rect: { top: 200 + i * 50, left: 260, width: 20, height: 20 } });
    falseBtns.push(fRadio);
    trueBtns.push(tRadio);
    tbody.appendChild(
      el(doc, "tr", {}, [
        el(doc, "td", { text: txt }),
        el(doc, "td", {}, [fRadio]),
        el(doc, "td", {}, [tRadio])
      ])
    );
  });
  const table = el(doc, "table", { rect: { top: 160, left: 20, width: 340, height: 280 } }, [thead, tbody]);
  doc.body.appendChild(el(doc, "div", { rect: { top: 100, left: 20, width: 340, height: 400 } }, ["Xét các mệnh đề:", table]));

  const cls = EXT.classifyQuestionInScope(doc, true);
  assert.strictEqual(cls.type, "TRUE_FALSE");
  assert.strictEqual(cls.tf.trueBtns[0], trueBtns[0]);
  assert.strictEqual(cls.tf.falseBtns[0], falseBtns[0]);
  assert.strictEqual(cls.tf.statements.length, 4);
  assert.ok(cls.tf.statements[0].includes("1+1=2"));
});

test("7. Đúng/Sai Chiến lược B: nút div/flex ghép theo tọa độ top & bỏ hàng tiêu đề giả", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const box = el(doc, "div", { rect: { top: 120, left: 20, width: 340, height: 340 } });
  // Hàng tiêu đề giả
  box.appendChild(el(doc, "div", { rect: { top: 130, left: 20, width: 320, height: 30 } }, [
    el(doc, "span", { text: "Mệnh đề", rect: { top: 130, left: 20, width: 120, height: 24 } }),
    el(doc, "span", { text: "Đúng", rect: { top: 130, left: 200, width: 50, height: 24 } }),
    el(doc, "span", { text: "Sai", rect: { top: 130, left: 260, width: 50, height: 24 } })
  ]));
  for (let i = 0; i < 4; i++) {
    const y = 180 + i * 50;
    box.appendChild(el(doc, "div", { rect: { top: y, left: 20, width: 320, height: 40 } }, [
      el(doc, "span", { text: `${String.fromCharCode(97 + i)}) Ý ${i + 1}`, rect: { top: y, left: 20, width: 150, height: 30 } }),
      el(doc, "button", { text: "Đúng", rect: { top: y, left: 200, width: 50, height: 30 } }),
      el(doc, "button", { text: "Sai", rect: { top: y, left: 260, width: 50, height: 30 } })
    ]));
  }
  doc.body.appendChild(box);
  const cls = EXT.classifyQuestionInScope(doc, true);
  assert.strictEqual(cls.type, "TRUE_FALSE");
  assert.strictEqual(cls.tf.trueBtns.length, 4);
  assert.ok(cls.tf.statements[3].includes("Ý 4"));
});

test("8. Đúng/Sai Chiến lược C: 8 radio Ant Design (dedupeNestedControls)", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const wrap = el(doc, "div", { rect: { top: 100, left: 20, width: 340, height: 320 } });
  for (let i = 0; i < 4; i++) {
    const y = 140 + i * 50;
    const makeRadio = (left) =>
      el(doc, "label", { className: "ant-radio-wrapper", rect: { top: y, left, width: 30, height: 30 } }, [
        el(doc, "span", { className: "ant-radio", rect: { top: y, left, width: 20, height: 20 } }, [
          el(doc, "input", { type: "radio", cs: { opacity: "0" }, rect: { top: y, left, width: 20, height: 20 } })
        ])
      ]);
    wrap.appendChild(el(doc, "div", { rect: { top: y, left: 20, width: 320, height: 40 } }, [
      el(doc, "span", { text: `${String.fromCharCode(97 + i)}) Phát biểu`, rect: { top: y, left: 20, width: 160, height: 30 } }),
      makeRadio(210),
      makeRadio(270)
    ]));
  }
  doc.body.appendChild(wrap);
  const cls = EXT.classifyQuestionInScope(doc, true);
  assert.strictEqual(cls.type, "TRUE_FALSE");
  assert.strictEqual(cls.tf.trueBtns.length, 4);
});

test("9. MCQ Tầng 1: badge A-D + lọc bẫy hình học <b>A</b><b>B</b><b>C</b><b>D</b>", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const qBox = el(doc, "div", { rect: { top: 80, left: 20, width: 340, height: 400 } }, [
    el(doc, "p", { rect: { top: 90, left: 20, width: 320, height: 40 } }, [
      "Cho hình chóp ",
      el(doc, "b", { text: "A", rect: { top: 95, left: 100, width: 12, height: 18 } }),
      el(doc, "b", { text: "B", rect: { top: 95, left: 115, width: 12, height: 18 } }),
      el(doc, "b", { text: "C", rect: { top: 95, left: 130, width: 12, height: 18 } }),
      el(doc, "b", { text: "D", rect: { top: 95, left: 145, width: 12, height: 18 } }),
      " có đáy là hình vuông."
    ])
  ]);
  const opts = el(doc, "div", { rect: { top: 180, left: 20, width: 320, height: 220 } });
  ["A", "B", "C", "D"].forEach((L, i) => {
    const y = 190 + i * 50;
    opts.appendChild(el(doc, "div", { rect: { top: y, left: 20, width: 300, height: 40 } }, [
      el(doc, "span", { text: L, rect: { top: y, left: 25, width: 24, height: 24 } }),
      el(doc, "span", { text: `Đáp án ${i + 1}`, rect: { top: y, left: 60, width: 200, height: 24 } })
    ]));
  });
  qBox.appendChild(opts);
  doc.body.appendChild(qBox);
  const cls = EXT.classifyQuestionInScope(doc, true);
  assert.strictEqual(cls.type, "MCQ");
  assert.strictEqual(cls.mcq[1].text, "Đáp án 2");
});

test("10. MCQ Tầng 2: khối đáp án viết liền 'A. Nội dung'", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const opts = el(doc, "div", { rect: { top: 150, left: 20, width: 320, height: 240 } }, [
    el(doc, "button", { text: "A. Quang hợp", rect: { top: 160, left: 20, width: 300, height: 40 } }),
    el(doc, "button", { text: "B. Hô hấp", rect: { top: 210, left: 20, width: 300, height: 40 } }),
    el(doc, "button", { text: "C. Thoát hơi nước", rect: { top: 260, left: 20, width: 300, height: 40 } }),
    el(doc, "button", { text: "D. Lên men", rect: { top: 310, left: 20, width: 300, height: 40 } })
  ]);
  doc.body.appendChild(el(doc, "div", { rect: { top: 80, left: 20, width: 340, height: 350 } }, ["Quá trình nào tạo O2?", opts]));
  const cls = EXT.classifyQuestionInScope(doc, true);
  assert.strictEqual(cls.type, "MCQ");
  assert.strictEqual(cls.mcq[0].text, "Quang hợp");
});

test("11. MCQ Tầng 3: 4 nút radio không gắn chữ cái A-D", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const list = el(doc, "div", { rect: { top: 160, left: 20, width: 320, height: 220 } });
  ["Hà Nội", "Huế", "Đà Nẵng", "TP.HCM"].forEach((city, i) => {
    const y = 170 + i * 45;
    list.appendChild(el(doc, "label", { rect: { top: y, left: 20, width: 280, height: 36 } }, [
      el(doc, "input", { type: "radio", rect: { top: y + 6, left: 24, width: 18, height: 18 } }),
      el(doc, "span", { text: city, rect: { top: y, left: 50, width: 180, height: 28 } })
    ]));
  });
  doc.body.appendChild(el(doc, "div", { rect: { top: 80, left: 20, width: 340, height: 340 } }, ["Thủ đô Việt Nam?", list]));
  const cls = EXT.classifyQuestionInScope(doc, true);
  assert.strictEqual(cls.type, "MCQ");
  assert.strictEqual(cls.mcq[0].letter, "A");
  assert.strictEqual(cls.mcq[0].text, "Hà Nội");
});

test("12. SHORT_ANSWER: bỏ qua ô tìm kiếm/nhảy câu và bắt đúng ô điền đáp án", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const searchInp = el(doc, "input", { type: "search", placeholder: "Tìm câu hỏi", rect: { top: 60, left: 20, width: 150, height: 30 } });
  const jumpInp = el(doc, "input", { type: "number", attrs: { min: "1", max: "150" }, rect: { top: 60, left: 200, width: 60, height: 30 } });
  const ansInp = el(doc, "input", { type: "text", placeholder: "Nhập đáp án", rect: { top: 220, left: 20, width: 180, height: 36 } });
  doc.body.appendChild(el(doc, "div", { rect: { top: 50, left: 20, width: 340, height: 260 } }, [
    searchInp,
    jumpInp,
    el(doc, "p", { text: "Tính giá trị của 2^3" }),
    ansInp
  ]));
  const cls = EXT.classifyQuestionInScope(doc, true);
  assert.strictEqual(cls.type, "SHORT_ANSWER");
  assert.strictEqual(cls.shortInp, ansInp);
});

test("13. detectUIAns phát hiện CSS outlier tương đối & getMultiBlocks tách nhiều câu", () => {
  const { doc, env } = createTestEnvironment();
  const { EXT } = loadModulesInEnv(env);
  const q1 = el(doc, "div", { rect: { top: 80, left: 20, width: 340, height: 260 } }, [
    el(doc, "b", { text: "Câu 1:", rect: { top: 80, left: 20, width: 80, height: 24 } }),
    el(doc, "div", { rect: { top: 120, left: 20, width: 300, height: 180 } }, [
      el(doc, "button", { text: "A. 1", cs: { backgroundColor: "rgb(255,255,255)", borderColor: "rgb(200,200,200)", color: "rgb(0,0,0)" }, rect: { top: 120, left: 20, width: 280, height: 36 } }),
      el(doc, "button", { text: "B. 2", cs: { backgroundColor: "rgb(37,99,235)", borderColor: "rgb(37,99,235)", color: "rgb(255,255,255)" }, rect: { top: 162, left: 20, width: 280, height: 36 } }),
      el(doc, "button", { text: "C. 3", cs: { backgroundColor: "rgb(255,255,255)", borderColor: "rgb(200,200,200)", color: "rgb(0,0,0)" }, rect: { top: 204, left: 20, width: 280, height: 36 } }),
      el(doc, "button", { text: "D. 4", cs: { backgroundColor: "rgb(255,255,255)", borderColor: "rgb(200,200,200)", color: "rgb(0,0,0)" }, rect: { top: 246, left: 20, width: 280, height: 36 } })
    ])
  ]);
  const q2 = el(doc, "div", { rect: { top: 380, left: 20, width: 340, height: 260 } }, [
    el(doc, "b", { text: "Câu 2:", rect: { top: 380, left: 20, width: 80, height: 24 } }),
    el(doc, "input", { type: "text", rect: { top: 430, left: 20, width: 150, height: 36 } })
  ]);
  doc.body.appendChild(q1);
  doc.body.appendChild(q2);

  const blocks = EXT.getMultiBlocks(doc);
  assert.strictEqual(blocks.length, 2);
  const cls1 = EXT.classifyQuestionInScope(blocks[0].blockEl, true);
  assert.strictEqual(EXT.detectUIAns("MCQ", cls1.mcq, null, null), "B");
});

// =========================================================================
// 7 BÀI TEST MOBILE PORTRAIT, OFF-SCREEN LONG HTML, 3-LAYER VISUAL & AGENT
// =========================================================================
test("14. Mobile Portrait (vw=390px): không nhận nhầm khung chính là Nav Panel, vẫn lọc Drawer fixed & Header", () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const { EXT } = loadModulesInEnv(env);

  const mainQuizCard = el(doc, "div", {
    rect: { top: 70, left: 12, width: 366, height: 640 },
    cs: { position: "static" }
  }, [
    // Ngay cả khi chứa 6 thẻ số nhỏ trong đề bài Toán dãy số
    el(doc, "span", { text: "1" }), el(doc, "span", { text: "2" }), el(doc, "span", { text: "3" }),
    el(doc, "span", { text: "4" }), el(doc, "span", { text: "5" }), el(doc, "span", { text: "6" })
  ]);

  const fixedDrawer = el(doc, "div", {
    className: "ant-drawer answer-sheet",
    rect: { top: 0, left: 40, width: 350, height: 844 },
    cs: { position: "fixed" }
  }, [
    el(doc, "button", { text: "1" }), el(doc, "button", { text: "2" }), el(doc, "button", { text: "3" }),
    el(doc, "button", { text: "4" }), el(doc, "button", { text: "5" })
  ]);

  const headerBar = el(doc, "header", { rect: { top: 0, left: 0, width: 390, height: 56 } });
  doc.body.appendChild(headerBar);
  doc.body.appendChild(mainQuizCard);
  doc.body.appendChild(fixedDrawer);

  assert.strictEqual(EXT.isNavPanelContainer(mainQuizCard), false);
  assert.strictEqual(EXT.isNavPanelContainer(fixedDrawer), true);
  assert.strictEqual(EXT.isNavPanelContainer(headerBar), true);
});

test("15. Đề dài bị khuất ngoài viewport (top=-200 & top=1500): đọc trọn vẹn 100% đề + đáp án", () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const { EXT } = loadModulesInEnv(env);

  const wrapper = el(doc, "div", { rect: { top: -240, left: 10, width: 370, height: 1900 } });
  const passage = el(doc, "div", {
    rect: { top: -220, left: 10, width: 370, height: 420 },
    text: "Read the following passage carefully. ".repeat(8) + "Global warming impacts coastal cities significantly."
  });
  const qContainer = el(doc, "div", { rect: { top: 220, left: 10, width: 370, height: 1420 } });
  qContainer.appendChild(el(doc, "p", { text: "Câu 5: What is the main idea of the passage?", rect: { top: -30, left: 10, width: 350, height: 50 } }));
  const opts = el(doc, "div", { rect: { top: 1450, left: 10, width: 360, height: 240 } });
  ["Coastal erosion", "Solar panels", "Marine traffic", "Arctic winds"].forEach((txt, i) => {
    const y = 1480 + i * 52;
    opts.appendChild(el(doc, "div", { rect: { top: y, left: 12, width: 350, height: 44 } }, [
      el(doc, "span", { text: String.fromCharCode(65 + i), rect: { top: y, left: 16, width: 24, height: 24 } }),
      el(doc, "span", { text: txt, rect: { top: y, left: 50, width: 280, height: 30 } })
    ]));
  });
  qContainer.appendChild(opts);
  wrapper.appendChild(passage);
  wrapper.appendChild(qContainer);
  doc.body.appendChild(wrapper);

  const cls = EXT.classifyQuestionInScope(doc, false);
  assert.strictEqual(cls.type, "MCQ");
  assert.strictEqual(cls.mcq.length, 4);
  assert.strictEqual(cls.mcq[3].text, "Arctic winds");

  const payload = EXT.extractQuestionPayload(doc, cls);
  assert.ok(payload.stemText.includes("What is the main idea"));
  assert.ok(payload.contextPassage.includes("Global warming impacts coastal cities"));
  assert.ok(payload.extraDetails.includes("D. Arctic winds"));
});

test("16. Câu chỉ có chữ / LaTeX / gạch chân: hasVisuals = false và KHÔNG gọi chụp ảnh", async () => {
  let screenshotCalls = 0;
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const { EXT, AGENT } = loadModulesInEnv(env, async (handler) => {
    if (handler === "takeScreenshot") screenshotCalls += 1;
    return null;
  });

  const qBox = el(doc, "div", { rect: { top: 90, left: 12, width: 366, height: 350 } }, [
    el(doc, "p", { text: "Choose the word whose underlined part differs in pronunciation." })
  ]);
  const opts = el(doc, "div", { rect: { top: 160, left: 12, width: 360, height: 220 } });
  [
    ["A", "h", "ea", "d"],
    ["B", "br", "ea", "d"],
    ["C", "r", "ea", "d"],
    ["D", "d", "ea", "d"]
  ].forEach(([L, pre, u, suf], i) => {
    const y = 170 + i * 48;
    opts.appendChild(el(doc, "div", { rect: { top: y, left: 12, width: 350, height: 40 } }, [
      el(doc, "span", { text: L, rect: { top: y, left: 16, width: 24, height: 24 } }),
      el(doc, "span", { rect: { top: y, left: 48, width: 200, height: 24 } }, [
        pre,
        el(doc, "u", { text: u }),
        suf
      ])
    ]));
  });
  qBox.appendChild(opts);
  doc.body.appendChild(qBox);

  const cls = EXT.classifyQuestionInScope(doc, true);
  const payload = EXT.extractQuestionPayload(doc, cls);
  assert.strictEqual(payload.hasUnderline, true);
  assert.strictEqual(payload.hasVisuals, false);

  const imgs = await AGENT._internalForTest.prepareVisualAttachments(payload, cls, false);
  assert.strictEqual(imgs.length, 0);
  assert.strictEqual(screenshotCalls, 0);
});

test("17. Lớp 1 bóc ảnh đa nguồn (<img> inline + remote cookie + <canvas> + <svg> 2x PNG + [Ảnh Mệnh đề])", async () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });

  // Mock browser Image + Canvas 2x rasterizer cho <svg>
  const origCreateEl = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const node = origCreateEl(tag);
    if (String(tag).toLowerCase() === "canvas") {
      const protoToDataUrl = node.toDataURL.bind(node);
      node.getContext = () => ({
        fillStyle: "#fff",
        fillRect: () => {},
        drawImage: () => {}
      });
      node.toDataURL = (mime) => {
        if (node._toDataURL) return protoToDataUrl(mime);
        return "data:image/png;base64,SVG_2X_PNG_B64";
      };
    }
    return node;
  };
  env.Image = class {
    set src(_v) {
      setTimeout(() => this.onload && this.onload(), 2);
    }
  };

  const { EXT, AGENT } = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "fetchImagesWithCookies") {
      return args.items.map((it) => ({
        id: it.id,
        ok: true,
        mimeType: "image/png",
        data: "REMOTE_COOKIE_B64"
      }));
    }
    return null;
  });

  const stemImg = el(doc, "img", {
    src: "https://cdn.onluyen.vn/graph_stem.png",
    width: 280,
    height: 180,
    rect: { top: 100, left: 20, width: 280, height: 180 }
  });
  const choiceACanvas = el(doc, "canvas", {
    width: 140,
    height: 100,
    rect: { top: 320, left: 60, width: 140, height: 100 }
  });
  choiceACanvas._toDataURL = "data:image/png;base64,CANVAS_OPT_A_B64";

  const choiceBImg = el(doc, "img", {
    src: "data:image/jpeg;base64,INLINE_OPT_B_B64",
    width: 140,
    height: 100,
    rect: { top: 430, left: 60, width: 140, height: 100 }
  });

  const choiceCSvg = el(doc, "svg", {
    width: 120,
    height: 90,
    rect: { top: 540, left: 60, width: 120, height: 90 },
    text: "<path d='M0 0 L10 10'/>"
  });

  const qBox = el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 640 } }, [
    el(doc, "p", {}, ["Đồ thị hàm số:", stemImg]),
    el(doc, "div", { rect: { top: 310, left: 10, width: 350, height: 380 } }, [
      el(doc, "div", { rect: { top: 320, left: 10, width: 340, height: 105 } }, [
        el(doc, "span", { text: "A", rect: { top: 320, left: 14, width: 24, height: 24 } }),
        choiceACanvas
      ]),
      el(doc, "div", { rect: { top: 430, left: 10, width: 340, height: 105 } }, [
        el(doc, "span", { text: "B", rect: { top: 430, left: 14, width: 24, height: 24 } }),
        choiceBImg
      ]),
      el(doc, "div", { rect: { top: 540, left: 10, width: 340, height: 100 } }, [
        el(doc, "span", { text: "C", rect: { top: 540, left: 14, width: 24, height: 24 } }),
        choiceCSvg
      ]),
      el(doc, "div", { rect: { top: 650, left: 10, width: 340, height: 40 } }, [
        el(doc, "span", { text: "D", rect: { top: 650, left: 14, width: 24, height: 24 } }),
        el(doc, "span", { text: "Hàm bậc 4" })
      ])
    ])
  ]);
  doc.body.appendChild(qBox);

  const cls = EXT.classifyQuestionInScope(doc, true);
  const payload = EXT.extractQuestionPayload(doc, cls);
  assert.strictEqual(payload.hasVisuals, true);

  const imgs = await AGENT._internalForTest.prepareVisualAttachments(payload, cls, false);
  const byLabel = new Map(imgs.map((i) => [i.label, i.data]));
  assert.strictEqual(byLabel.get("[Ảnh Đề bài]"), "REMOTE_COOKIE_B64");
  assert.strictEqual(byLabel.get("[Ảnh Đáp án A]"), "CANVAS_OPT_A_B64");
  assert.strictEqual(byLabel.get("[Ảnh Đáp án B]"), "INLINE_OPT_B_B64");
  assert.strictEqual(byLabel.get("[Ảnh Đáp án C]"), "SVG_2X_PNG_B64");

  // Kiểm tra thêm nhãn [Ảnh Mệnh đề b] cho câu Đúng/Sai
  const tfDocEnv = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const tfLoaded = loadModulesInEnv(tfDocEnv.env, async () => null);
  const tfTable = el(tfDocEnv.doc, "table", { rect: { top: 160, left: 10, width: 360, height: 280 } }, [
    el(tfDocEnv.doc, "tr", {}, [
      el(tfDocEnv.doc, "td", { text: "a) Ý A" }),
      el(tfDocEnv.doc, "td", {}, [el(tfDocEnv.doc, "button", { text: "Đúng" })]),
      el(tfDocEnv.doc, "td", {}, [el(tfDocEnv.doc, "button", { text: "Sai" })])
    ]),
    el(tfDocEnv.doc, "tr", {}, [
      el(tfDocEnv.doc, "td", {}, [
        "b) Xem đồ thị ",
        el(tfDocEnv.doc, "img", { src: "data:image/png;base64,TF_STMT_B_B64", width: 100, height: 80, rect: { top: 220, left: 40, width: 100, height: 80 } })
      ]),
      el(tfDocEnv.doc, "td", {}, [el(tfDocEnv.doc, "button", { text: "Đúng" })]),
      el(tfDocEnv.doc, "td", {}, [el(tfDocEnv.doc, "button", { text: "Sai" })])
    ]),
    el(tfDocEnv.doc, "tr", {}, [
      el(tfDocEnv.doc, "td", { text: "c) Ý C" }),
      el(tfDocEnv.doc, "td", {}, [el(tfDocEnv.doc, "button", { text: "Đúng" })]),
      el(tfDocEnv.doc, "td", {}, [el(tfDocEnv.doc, "button", { text: "Sai" })])
    ]),
    el(tfDocEnv.doc, "tr", {}, [
      el(tfDocEnv.doc, "td", { text: "d) Ý D" }),
      el(tfDocEnv.doc, "td", {}, [el(tfDocEnv.doc, "button", { text: "Đúng" })]),
      el(tfDocEnv.doc, "td", {}, [el(tfDocEnv.doc, "button", { text: "Sai" })])
    ])
  ]);
  tfDocEnv.doc.body.appendChild(el(tfDocEnv.doc, "div", { rect: { top: 100, left: 10, width: 370, height: 400 } }, ["Xét bảng:", tfTable]));
  const tfCls = tfLoaded.EXT.classifyQuestionInScope(tfDocEnv.doc, true);
  const tfPayload = tfLoaded.EXT.extractQuestionPayload(tfDocEnv.doc, tfCls);
  const tfImgs = await tfLoaded.AGENT._internalForTest.prepareVisualAttachments(tfPayload, tfCls, false);
  assert.strictEqual(tfImgs[0].label, "[Ảnh Mệnh đề b]");
  assert.strictEqual(tfImgs[0].data, "TF_STMT_B_B64");
});

test("18. Lớp 2 Auto Capture Stage: ẩn pill, dựng #__onluyen_capture_stage cho bảng biến thiên, chụp & khôi phục cuộn", async () => {
  const pillVisibilityLog = [];
  let stageSeenDuringShot = false;
  const { doc, env, scrollState } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  env.scrollTo({ left: 0, top: 420 });

  const { EXT, AGENT } = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "setFloatingPillVisible") {
      pillVisibilityLog.push(args.visible);
      return { visible: args.visible };
    }
    if (handler === "takeScreenshot") {
      const stage = doc.getElementById("__onluyen_capture_stage");
      stageSeenDuringShot = Boolean(stage && stage.style.zIndex === "2147483647");
      return { mimeType: "image/jpeg", data: "STAGE_BBT_JPEG_B64" };
    }
    return null;
  });

  const bbtTable = el(doc, "table", {
    className: "variation-table",
    rect: { top: 140, left: 16, width: 350, height: 160 }
  }, [
    el(doc, "tr", {}, [el(doc, "td", { text: "x" }), el(doc, "td", { text: "-∞" }), el(doc, "td", { text: "1" }), el(doc, "td", { text: "+∞" })]),
    el(doc, "tr", {}, [el(doc, "td", { text: "y'" }), el(doc, "td", { text: "+" }), el(doc, "td", { text: "0" }), el(doc, "td", { text: "-" })]),
    el(doc, "tr", {}, [el(doc, "td", { text: "y" }), el(doc, "td", { text: "-∞ ↗" }), el(doc, "td", { text: "4" }), el(doc, "td", { text: "↘ -∞" })])
  ]);

  const qBox = el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 500 } }, [
    el(doc, "p", {}, ["Cho bảng biến thiên:", bbtTable]),
    el(doc, "div", { rect: { top: 320, left: 10, width: 350, height: 200 } }, [
      el(doc, "button", { text: "A. x = 1", rect: { top: 320, left: 10, width: 340, height: 40 } }),
      el(doc, "button", { text: "B. x = 4", rect: { top: 365, left: 10, width: 340, height: 40 } }),
      el(doc, "button", { text: "C. x = 0", rect: { top: 410, left: 10, width: 340, height: 40 } }),
      el(doc, "button", { text: "D. x = -1", rect: { top: 455, left: 10, width: 340, height: 40 } })
    ])
  ]);
  doc.body.appendChild(qBox);

  const cls = EXT.classifyQuestionInScope(doc, true);
  const payload = EXT.extractQuestionPayload(doc, cls);
  const imgs = await AGENT._internalForTest.prepareVisualAttachments(payload, cls, false);

  assert.strictEqual(stageSeenDuringShot, true);
  assert.strictEqual(doc.getElementById("__onluyen_capture_stage"), null, "Stage phải được gỡ sau khi chụp");
  assert.deepStrictEqual(pillVisibilityLog, [false, true]);
  assert.strictEqual(scrollState.y, 420, "Vị trí cuộn cũ phải được khôi phục");
  assert.strictEqual(imgs.length, 1);
  assert.strictEqual(imgs[0].data, "STAGE_BBT_JPEG_B64");
});

test("19. Lớp 3 Multi-Scroll Fallback khi isManualRetry dù DOM không tách được ảnh Lớp 1/2", async () => {
  const pillLog = [];
  const { doc, env, scrollState } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  env.scrollTo({ left: 0, top: 300 });

  const { EXT, AGENT } = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "setFloatingPillVisible") {
      pillLog.push(args?.visible);
      return { visible: args?.visible };
    }
    if (handler === "takeScreenshot") {
      return { mimeType: "image/jpeg", data: "FALLBACK_SCROLL_SHOT" };
    }
    return null;
  });

  const qBox = el(doc, "div", { rect: { top: 90, left: 10, width: 370, height: 340 } }, [
    el(doc, "p", { text: "Tìm cực trị hàm số sau:" }),
    el(doc, "div", { rect: { top: 150, left: 10, width: 350, height: 200 } }, [
      el(doc, "button", { text: "A. 1", rect: { top: 160, left: 10, width: 340, height: 40 } }),
      el(doc, "button", { text: "B. 2", rect: { top: 205, left: 10, width: 340, height: 40 } }),
      el(doc, "button", { text: "C. 3", rect: { top: 250, left: 10, width: 340, height: 40 } }),
      el(doc, "button", { text: "D. 4", rect: { top: 295, left: 10, width: 340, height: 40 } })
    ])
  ]);
  doc.body.appendChild(qBox);

  const cls = EXT.classifyQuestionInScope(doc, true);
  const payload = EXT.extractQuestionPayload(doc, cls);
  const imgs = await AGENT._internalForTest.prepareVisualAttachments(payload, cls, true);

  assert.ok(qBox.scrollIntoViewCalls.length >= 1);
  assert.strictEqual(imgs.length, 2);
  assert.strictEqual(imgs[0].label, "[Ảnh Toàn bộ Câu hỏi]");
  assert.strictEqual(imgs[1].label, "[Ảnh Vùng Đáp án]");
  assert.strictEqual(imgs[0].data, "FALLBACK_SCROLL_SHOT");
  assert.deepStrictEqual(pillLog, [false, true]);
  assert.strictEqual(scrollState.y, 300);
});

test("20. mobile_agent.js: scrollIntoView + Post-Click Verification 250ms tự click lại + rejectedAnswers + bỏ qua sau 3 lỗi", async () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const { EXT, AGENT } = loadModulesInEnv(env, async () => null);

  let clickCounter = 0;
  const rows = [];
  const opts = el(doc, "div", { rect: { top: 1200, left: 10, width: 350, height: 240 } });
  ["A", "B", "C", "D"].forEach((L, i) => {
    const y = 1210 + i * 52;
    const row = el(doc, "button", { text: `${L}. Lựa chọn ${L}`, rect: { top: y, left: 10, width: 340, height: 44 } });
    if (L === "C") {
      row.addEventListener("click", () => {
        clickCounter += 1;
        // Lần click đầu giả lập không ăn (không bật class selected); lần 2 mới ăn!
        if (clickCounter >= 2) {
          row.setAttribute("class", "selected");
        }
      });
    }
    rows.push(row);
    opts.appendChild(row);
  });
  doc.body.appendChild(el(doc, "div", { rect: { top: 100, left: 10, width: 370, height: 1400 } }, ["Câu hỏi:", opts]));

  const cls = EXT.classifyQuestionInScope(doc, true);
  await new Promise((resolve) => {
    AGENT._internalForTest.applyAnswerToDOM("MCQ", "C", null, cls.mcq, null, null, resolve);
  });

  assert.ok(rows[2].scrollIntoViewCalls.length >= 1, "Phải gọi scrollIntoView trước khi click");
  assert.ok(clickCounter >= 2, "Phải tự click nhắc lại khi Post-Click Verification phát hiện lần 1 chưa ăn");
  assert.strictEqual(EXT.detectUIAns("MCQ", cls.mcq, null, null), "C");

  // Kiểm tra cộng dồn rejectedAnswers
  const rej1 = AGENT._internalForTest.getRejectedAnswers("SIG_1", "A");
  const rej2 = AGENT._internalForTest.getRejectedAnswers("SIG_1", "B");
  assert.deepStrictEqual(rej1, ["A"]);
  assert.deepStrictEqual(rej2, ["A", "B"]);

  // Kiểm tra List Mode bỏ qua câu sau 3 lần lỗi liên tiếp
  const listEnv = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const solvedCodes = [];
  const origSetTimeout = global.setTimeout;
  const listLoaded = loadModulesInEnv(listEnv.env, async (handler, args) => {
    if (handler === "solveQuiz") {
      if (args.qCode === "Câu 1") {
        return { success: false, error: "429 test" };
      }
      solvedCodes.push(args.qCode);
      return { success: true, result: { normalizedAns: "5", answerKind: "NUMBER", confidence: 95 } };
    }
    return null;
  });

  // Thay setTimeout tốc độ cao cho mock retry loop của List Mode
  listLoaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.min(ms, 10));
  const b1 = el(listEnv.doc, "div", { rect: { top: 80, left: 10, width: 360, height: 150 } }, [
    el(listEnv.doc, "b", { text: "Câu 1:", rect: { top: 80, left: 10, width: 80, height: 24 } }),
    el(listEnv.doc, "input", { type: "text", rect: { top: 120, left: 10, width: 140, height: 36 } })
  ]);
  const b2 = el(listEnv.doc, "div", { rect: { top: 260, left: 10, width: 360, height: 150 } }, [
    el(listEnv.doc, "b", { text: "Câu 2:", rect: { top: 260, left: 10, width: 80, height: 24 } }),
    el(listEnv.doc, "input", { type: "text", rect: { top: 300, left: 10, width: 140, height: 36 } })
  ]);
  listEnv.doc.body.appendChild(b1);
  listEnv.doc.body.appendChild(b2);

  // Kiểm tra mặc định tắt Mod (app OnLuyen bình thường) khi khởi tạo, sau đó bật Mod để test List Mode
  assert.strictEqual(listLoaded.AGENT.getDiagnostics().isExtensionEnabled, false, "Mặc định Mod phải tắt để dùng như app thường");
  listLoaded.AGENT.updateConfig({ autoSolverEnabled: true });

  await listLoaded.AGENT.forceScanNow();
  // Chờ đủ cho 3 lần fail của Câu 1 + giải xong Câu 2
  for (let i = 0; i < 35; i++) {
    await new Promise((r) => origSetTimeout(r, 40));
    if (solvedCodes.includes("Câu 2")) break;
  }
  const diag = listLoaded.AGENT.getDiagnostics();
  listLoaded.AGENT.cleanup();
  assert.strictEqual(diag.skippedListCount, 1, "Câu 1 lỗi 3 lần phải bị bỏ qua");
  assert.ok(solvedCodes.includes("Câu 2"), "Phải tự động chuyển sang giải Câu 2");
});

test("21. Benchmark hiệu năng DOM nặng 2000 node (mobile 390px + KaTeX + Drawer): quét nhanh & ít reflow", () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  let rectCalls = 0;
  let csCalls = 0;
  const origCs = env.getComputedStyle;
  env.getComputedStyle = (node) => {
    csCalls += 1;
    return origCs(node);
  };

  const origCreate = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const node = origCreate(tag);
    const origRect = node.getBoundingClientRect.bind(node);
    node.getBoundingClientRect = () => {
      rectCalls += 1;
      return origRect();
    };
    return node;
  };

  const { EXT } = loadModulesInEnv(env);

  // Header + Drawer fixed với 40 thẻ số
  doc.body.appendChild(el(doc, "header", { rect: { top: 0, left: 0, width: 390, height: 56 } }, [
    el(doc, "span", { text: "00:45:12" })
  ]));
  const drawer = el(doc, "div", {
    className: "ant-drawer answer-sheet",
    cs: { position: "fixed" },
    rect: { top: 0, left: 40, width: 350, height: 844 }
  });
  for (let i = 1; i <= 40; i++) {
    drawer.appendChild(el(doc, "button", { text: String(i), rect: { top: i * 18, left: 50, width: 32, height: 32 } }));
  }
  doc.body.appendChild(drawer);

  // Khung chính với ~2000 node + công thức KaTeX chứa A B C D
  const mainCard = el(doc, "div", { rect: { top: 70, left: 10, width: 370, height: 1200 } });
  mainCard.appendChild(el(doc, "p", { text: "Chọn đáp án đúng nhất:", rect: { top: 80, left: 16, width: 340, height: 30 } }));
  for (let i = 0; i < 480; i++) {
    mainCard.appendChild(el(doc, "div", { rect: { top: 120, left: 16, width: 340, height: 22 } }, [
      el(doc, "span", { text: `x${i}` }),
      el(doc, "span", { className: "katex" }, [el(doc, "span", { text: i % 4 === 0 ? "A" : "x" })]),
      el(doc, "b", { text: `${i}` })
    ]));
  }

  // Câu hỏi trắc nghiệm thật ở cuối
  const opts = el(doc, "div", { rect: { top: 900, left: 16, width: 350, height: 240 } });
  ["A", "B", "C", "D"].forEach((L, idx) => {
    const y = 910 + idx * 52;
    opts.appendChild(el(doc, "div", { rect: { top: y, left: 16, width: 340, height: 42 } }, [
      el(doc, "span", { text: L, rect: { top: y, left: 20, width: 24, height: 24 } }),
      el(doc, "span", { text: `Phương án đúng ${L}`, rect: { top: y, left: 52, width: 260, height: 26 } })
    ]));
  });
  mainCard.appendChild(opts);
  doc.body.appendChild(mainCard);

  const t0 = Date.now();
  EXT.beginScanCache();
  let cls;
  let payload;
  let detectRectCalls = 0;
  let detectCsCalls = 0;
  try {
    const blocks = EXT.getMultiBlocks(doc);
    assert.strictEqual(blocks.length, 0);
    cls = EXT.classifyQuestionInScope(doc, true);
    detectRectCalls = rectCalls;
    detectCsCalls = csCalls;
    payload = EXT.extractQuestionPayload(doc, cls);
  } finally {
    EXT.endScanCache();
  }
  const elapsedMs = Date.now() - t0;

  assert.strictEqual(cls.type, "MCQ");
  assert.strictEqual(cls.mcq[2].text, "Phương án đúng C");
  assert.ok(payload.stemText.includes("Chọn đáp án đúng nhất"));
  assert.ok(elapsedMs < 200, `Quét 2000 node mất quá lâu: ${elapsedMs}ms`);
  assert.ok(detectCsCalls < 40, `Quá nhiều getComputedStyle khi nhận diện câu hỏi (${detectCsCalls} lần)`);
  assert.ok(detectRectCalls < 80, `Quá nhiều getBoundingClientRect khi nhận diện câu hỏi (${detectRectCalls} lần)`);
  console.log(`    [Benchmark 2000 nodes: ${elapsedMs}ms, detectRectCalls=${detectRectCalls}, detectCsCalls=${detectCsCalls}]`);
});

test("22. Mobile full-screen fixed quiz shell không bị nhận nhầm là Nav & ẩn tổ tiên display:none được lọc sạch", () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const { EXT } = loadModulesInEnv(env);

  // Vỏ đề fixed full màn hình trên mobile
  const fixedShell = el(doc, "div", {
    className: "exam-player-shell",
    cs: { position: "fixed" },
    rect: { top: 0, left: 0, width: 390, height: 844 }
  });
  assert.strictEqual(EXT.isNavPanelContainer(fixedShell), false);

  // Modal đáp án ẩn tổ tiên (display: none trên cha, node con vẫn có rect)
  const hiddenParent = el(doc, "div", { style: { display: "none" }, rect: { top: 0, left: 0, width: 360, height: 300 } });
  ["A", "B", "C", "D"].forEach((L, i) => {
    hiddenParent.appendChild(
      el(doc, "div", { rect: { top: 100 + i * 40, left: 20, width: 300, height: 32 } }, [
        el(doc, "span", { text: L, rect: { top: 100 + i * 40, left: 20, width: 24, height: 24 } }),
        el(doc, "span", { text: `Bị ẩn ${L}`, rect: { top: 100 + i * 40, left: 50, width: 200, height: 24 } })
      ])
    );
  });
  fixedShell.appendChild(hiddenParent);

  const visibleOpts = el(doc, "div", { rect: { top: 160, left: 10, width: 360, height: 240 } });
  ["A", "B", "C", "D"].forEach((L, i) => {
    const y = 170 + i * 50;
    visibleOpts.appendChild(
      el(doc, "div", { rect: { top: y, left: 10, width: 350, height: 42 } }, [
        el(doc, "span", { text: L, rect: { top: y, left: 14, width: 24, height: 24 } }),
        el(doc, "span", { text: `Đáp án thật ${L}`, rect: { top: y, left: 46, width: 280, height: 28 } })
      ])
    );
  });
  fixedShell.appendChild(visibleOpts);
  doc.body.appendChild(fixedShell);

  const cls = EXT.classifyQuestionInScope(doc, true);
  assert.strictEqual(cls.type, "MCQ");
  assert.strictEqual(cls.mcq[0].text, "Đáp án thật A");
});

test("23. MCQ mobile: đáp án cao 520px, thẻ tách 'A.Nội dung', badge rộng 2x2 (165px), Tier 4 ::before & container ngữ nghĩa", () => {
  // 23a: Hàng cao 520px + thẻ tách không dấu cách "A.Nội dung"
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const { EXT } = loadModulesInEnv(env);
    const list = el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 2200 } });
    ["A", "B", "C", "D"].forEach((L, i) => {
      const y = 90 + i * 540;
      list.appendChild(
        el(doc, "div", { rect: { top: y, left: 10, width: 360, height: 520 } }, [
          el(doc, "span", { text: `${L}.` }),
          el(doc, "span", { text: `Nội dung dài ${L}` })
        ])
      );
    });
    doc.body.appendChild(list);
    const cls = EXT.classifyQuestionInScope(doc, true);
    assert.strictEqual(cls.type, "MCQ");
    assert.strictEqual(cls.mcq[3].text, "Nội dung dài D");
  }

  // 23b: Badge A-D lưới 2x2 rộng 165px trên mobile
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const { EXT } = loadModulesInEnv(env);
    const grid = el(doc, "div", { rect: { top: 200, left: 10, width: 370, height: 240 } });
    const coords = [
      [200, 12],
      [200, 195],
      [300, 12],
      [300, 195]
    ];
    ["A", "B", "C", "D"].forEach((L, i) => {
      const [y, x] = coords[i];
      grid.appendChild(
        el(doc, "div", { rect: { top: y, left: x, width: 170, height: 80 } }, [
          el(doc, "button", { text: L, rect: { top: y, left: x, width: 165, height: 42 } }),
          el(doc, "div", { text: `Lưới ${L}`, rect: { top: y + 44, left: x, width: 165, height: 28 } })
        ])
      );
    });
    doc.body.appendChild(grid);
    const cls = EXT.classifyQuestionInScope(doc, true);
    assert.strictEqual(cls.type, "MCQ");
    assert.strictEqual(cls.mcq[1].text, "Lưới B");
  }

  // 23c: Tier 4a CSS ::before badge A-D
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const { EXT } = loadModulesInEnv(env);
    const box = el(doc, "div", { rect: { top: 100, left: 10, width: 370, height: 300 } });
    ["A", "B", "C", "D"].forEach((L, i) => {
      box.appendChild(
        el(doc, "div", {
          className: "option-item",
          pseudo: { "::before": { content: `"${L}."` } },
          text: `Pseudo ${L}`,
          rect: { top: 120 + i * 50, left: 12, width: 350, height: 42 }
        })
      );
    });
    doc.body.appendChild(box);
    const cls = EXT.classifyQuestionInScope(doc, true);
    assert.strictEqual(cls.type, "MCQ");
    assert.strictEqual(cls.mcq[2].text, "Pseudo C");
  }

  // 23d: Tier 4b container ngữ nghĩa 4 lựa chọn không hiện chữ A-D
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const { EXT } = loadModulesInEnv(env);
    const box = el(doc, "div", { className: "answer-list", rect: { top: 120, left: 10, width: 370, height: 260 } }, [
      el(doc, "div", { text: "Phương án một", rect: { top: 130, left: 12, width: 350, height: 48 } }),
      el(doc, "div", { text: "Phương án hai", rect: { top: 188, left: 12, width: 350, height: 48 } }),
      el(doc, "div", { text: "Phương án ba", rect: { top: 246, left: 12, width: 350, height: 48 } }),
      el(doc, "div", { text: "Phương án bốn", rect: { top: 304, left: 12, width: 350, height: 48 } })
    ]);
    doc.body.appendChild(box);
    const cls = EXT.classifyQuestionInScope(doc, true);
    assert.strictEqual(cls.type, "MCQ");
    assert.strictEqual(cls.mcq[0].letter, "A");
    assert.strictEqual(cls.mcq[3].text, "Phương án bốn");
  }
});

test("24. Mobile Đúng/Sai thẻ xếp dọc (Đúng trên Sai) & Short Answer contenteditable=true", async () => {
  // Đúng/Sai xếp dọc theo card trên mobile
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const { EXT } = loadModulesInEnv(env);
  const wrap = el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 680 } });
  for (let i = 0; i < 4; i++) {
    const baseY = 90 + i * 160;
    wrap.appendChild(
      el(doc, "div", { rect: { top: baseY, left: 10, width: 360, height: 145 } }, [
        el(doc, "div", { text: `${String.fromCharCode(97 + i)}) Phát biểu dọc ${i + 1}`, rect: { top: baseY, left: 12, width: 340, height: 32 } }),
        el(doc, "button", { text: "Đúng", rect: { top: baseY + 40, left: 12, width: 160, height: 40 } }),
        el(doc, "button", { text: "Sai", rect: { top: baseY + 95, left: 12, width: 160, height: 40 } })
      ])
    );
  }
  doc.body.appendChild(wrap);
  const tfCls = EXT.classifyQuestionInScope(doc, true);
  assert.strictEqual(tfCls.type, "TRUE_FALSE");
  assert.strictEqual(tfCls.tf.trueBtns.length, 4);
  assert.ok(tfCls.tf.statements[2].includes("Phát biểu dọc 3"));

  // Short Answer dùng contenteditable="true"
  const ceEnv = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const ceLoaded = loadModulesInEnv(ceEnv.env, async () => null);
  const ceBox = el(ceEnv.doc, "div", { attrs: { contenteditable: "true" }, rect: { top: 200, left: 20, width: 220, height: 44 } });
  ceEnv.doc.body.appendChild(el(ceEnv.doc, "div", { rect: { top: 90, left: 10, width: 360, height: 220 } }, [
    el(ceEnv.doc, "p", { text: "Nhập kết quả:" }),
    ceBox
  ]));
  const ceCls = ceLoaded.EXT.classifyQuestionInScope(ceEnv.doc, true);
  assert.strictEqual(ceCls.type, "SHORT_ANSWER");
  assert.strictEqual(ceCls.shortInp, ceBox);

  await new Promise((resolve) => {
    ceLoaded.AGENT._internalForTest.applyAnswerToDOM("SHORT_ANSWER", "12,5", "NUMBER", [], ceBox, null, resolve);
  });
  assert.strictEqual(ceLoaded.EXT.detectUIAns("SHORT_ANSWER", null, ceBox, null), "12,5");
});

test("25. Agent: bỏ qua text ẩn/script trong body, nhận URL /home-student/practice, đồng bộ flutterInAppWebViewPlatformReady & reset SPA route", async () => {
  const listeners = new Map();
  const { doc, env } = createTestEnvironment({
    innerWidth: 390,
    innerHeight: 844,
    url: "https://app.onluyen.vn/home-student/practice/999?from=home-student"
  });
  env.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  env.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  };
  env.removeEventListener = (type, fn) => {
    const arr = listeners.get(type) || [];
    listeners.set(type, arr.filter((x) => x !== fn));
  };

  let getConfigCalls = 0;
  let enabledConfigReady = false;
  const solvedRequests = [];
  const { AGENT } = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "getConfig") {
      getConfigCalls += 1;
      if (!enabledConfigReady) return null;
      return { autoSolverEnabled: true, autoAdvanceEnabled: false, intelligenceMode: "smart" };
    }
    if (handler === "solveQuiz") {
      solvedRequests.push(args);
      return { success: true, result: { normalizedAns: "A", confidence: 94 } };
    }
    return null;
  });

  // Giả lập HTML ẩn / <script> có chữ "Tổng điểm Đáp án của bạn" nhưng chữ hiển thị (innerText) là đề thi thật
  doc.body.appendChild(el(doc, "script", { text: "Tổng điểm Đáp án của bạn" }));
  doc.body.appendChild(
    el(doc, "div", { rect: { top: 100, left: 10, width: 370, height: 340 } }, [
      el(doc, "p", { text: "Câu 1: Thủ đô của Pháp?" }),
      el(doc, "button", { text: "A. Paris", rect: { top: 160, left: 10, width: 340, height: 42 } }),
      el(doc, "button", { text: "B. Lyon", rect: { top: 210, left: 10, width: 340, height: 42 } }),
      el(doc, "button", { text: "C. Nice", rect: { top: 260, left: 10, width: 340, height: 42 } }),
      el(doc, "button", { text: "D. Marseille", rect: { top: 310, left: 10, width: 340, height: 42 } })
    ])
  );
  doc.body._innerText = "Câu 1: Thủ đô của Pháp?\nA. Paris\nB. Lyon\nC. Nice\nD. Marseille";

  // Ban đầu bridge trả null, sau khi flutterInAppWebViewPlatformReady bắn -> syncConfigFromNative bật lên và tự giải
  assert.strictEqual(getConfigCalls >= 1, true);
  enabledConfigReady = true;
  for (const fn of listeners.get("flutterInAppWebViewPlatformReady") || []) {
    await fn();
  }
  await new Promise((r) => setTimeout(r, 120));

  const diag = AGENT.getDiagnostics();
  AGENT.cleanup();
  assert.strictEqual(diag.configSynced, true);
  assert.strictEqual(diag.isQuiz, true);
  assert.strictEqual(diag.dom.mcqLetters.A, 0); // viết liền "A. Paris" không bị đếm nhầm chữ đơn
  assert.strictEqual(solvedRequests.length, 1);

  // Kiểm tra đổi route SPA reset solvedSignature
  const routeRes = AGENT.onRouteChanged("https://app.onluyen.vn/home-student/practice/1000");
  assert.strictEqual(routeRes.changed, true);
});

test("26. Ảnh icon nhỏ không bật hasVisuals và ảnh đề remote bị cắt mép top=10 vẫn đi Lớp 1 cookie fetch", async () => {
  let screenshotCalls = 0;
  let fetchedItems = [];
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const { EXT, AGENT } = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "takeScreenshot") {
      screenshotCalls += 1;
      return { mimeType: "image/jpeg", data: "SHOULD_NOT_HAPPEN" };
    }
    if (handler === "fetchImagesWithCookies") {
      fetchedItems = args.items || [];
      return fetchedItems.map((it) => ({
        id: it.id,
        ok: true,
        mimeType: "image/png",
        data: "FULL_RES_REMOTE_PNG"
      }));
    }
    return null;
  });

  // 26a: Câu chỉ có icon loa nhỏ 28x28 -> hasVisuals = false
  const iconBox = el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 320 } }, [
    el(doc, "p", {}, [
      "Listen and choose ",
      el(doc, "img", { src: "https://cdn.onluyen.vn/assets/audio-icon.png", width: 28, height: 28, rect: { top: 85, left: 120, width: 28, height: 28 } })
    ]),
    el(doc, "button", { text: "A. Cat", rect: { top: 140, left: 10, width: 340, height: 38 } }),
    el(doc, "button", { text: "B. Dog", rect: { top: 185, left: 10, width: 340, height: 38 } }),
    el(doc, "button", { text: "C. Bird", rect: { top: 230, left: 10, width: 340, height: 38 } }),
    el(doc, "button", { text: "D. Fish", rect: { top: 275, left: 10, width: 340, height: 38 } })
  ]);
  doc.body.appendChild(iconBox);
  const clsIcon = EXT.classifyQuestionInScope(doc, true);
  const payloadIcon = EXT.extractQuestionPayload(doc, clsIcon);
  assert.strictEqual(payloadIcon.hasVisuals, false);

  // 26b: Ảnh đề bài 320x200 bị cuộn cắt ở top=10 -> vẫn đi Lớp 1 fetchImagesWithCookies, KHÔNG gọi takeScreenshot
  doc.body.removeChild(iconBox);
  const graphBox = el(doc, "div", { rect: { top: 5, left: 10, width: 360, height: 500 } }, [
    el(doc, "p", {}, [
      "Đồ thị:",
      el(doc, "img", { src: "https://cdn.onluyen.vn/do-thi-ham-so.png", width: 320, height: 200, rect: { top: 10, left: 20, width: 320, height: 200 } })
    ]),
    el(doc, "button", { text: "A. 1", rect: { top: 240, left: 10, width: 340, height: 38 } }),
    el(doc, "button", { text: "B. 2", rect: { top: 285, left: 10, width: 340, height: 38 } }),
    el(doc, "button", { text: "C. 3", rect: { top: 330, left: 10, width: 340, height: 38 } }),
    el(doc, "button", { text: "D. 4", rect: { top: 375, left: 10, width: 340, height: 38 } })
  ]);
  doc.body.appendChild(graphBox);
  const clsGraph = EXT.classifyQuestionInScope(doc, true);
  const payloadGraph = EXT.extractQuestionPayload(doc, clsGraph);
  assert.strictEqual(payloadGraph.hasVisuals, true);
  const imgs = await AGENT._internalForTest.prepareVisualAttachments(payloadGraph, clsGraph, false);
  assert.strictEqual(fetchedItems.length, 1);
  assert.strictEqual(imgs.length, 1);
  assert.strictEqual(imgs[0].data, "FULL_RES_REMOTE_PNG");
  assert.strictEqual(screenshotCalls, 0);
});

(async () => {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✔ PASS: ${t.name}`);
      passed += 1;
    } catch (err) {
      console.error(`  ✘ FAIL: ${t.name}`);
      console.error(`    ${err && err.stack ? err.stack : err}`);
      failed += 1;
    }
  }
  console.log(`\nTổng kết Test JS: ${passed}/${tests.length} đạt, ${failed} lỗi.`);
  process.exit(failed > 0 ? 1 : 0);
})();
