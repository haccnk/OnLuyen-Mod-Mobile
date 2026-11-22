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

test("27. Hủy tức thì khi tắt Mod lúc đang gọi AI: không click đáp án, không chuyển câu, không syncStatus đè", async () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const origSetTimeout = global.setTimeout;
  const statusAfterDisable = [];
  let resolveSolve = null;
  let disabledAtReached = false;

  const { AGENT } = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "solveQuiz") {
      return new Promise((resolve) => {
        resolveSolve = resolve;
      });
    }
    if (handler === "syncStatus" && disabledAtReached) {
      statusAfterDisable.push(args?.solverStatus || "");
    }
    return null;
  });
  AGENT._internalForTest.resetState();

  const optionBtns = [];
  let clickCount = 0;
  ["A", "B", "C", "D"].forEach((L, i) => {
    const btn = el(doc, "button", { text: `${L}. Phương án ${L}`, rect: { top: 150 + i * 50, left: 10, width: 340, height: 42 } });
    btn.addEventListener("click", () => {
      clickCount += 1;
    });
    optionBtns.push(btn);
  });
  const nextBtn = el(doc, "button", { text: "Câu tiếp", rect: { top: 400, left: 10, width: 160, height: 42 } });
  nextBtn.addEventListener("click", () => {
    clickCount += 1;
  });

  doc.body.appendChild(
    el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 400 } }, [
      el(doc, "p", { text: "Câu 1: Chọn đúng?" }),
      ...optionBtns,
      nextBtn
    ])
  );

  const started = AGENT._internalForTest.processScreen(false);
  assert.strictEqual(started.reason, "solving_started");

  // Chờ cho solveQuiz được gọi
  for (let i = 0; i < 20 && !resolveSolve; i++) {
    await new Promise((r) => origSetTimeout(r, 10));
  }
  assert.ok(resolveSolve, "Phải bắt đầu gọi solveQuiz");

  // Người dùng tắt Mod khi AI chưa trả về
  disabledAtReached = true;
  AGENT.updateConfig({ autoSolverEnabled: false });

  // AI trả về trễ
  resolveSolve({ success: true, result: { normalizedAns: "B", confidence: 98 } });
  await new Promise((r) => origSetTimeout(r, 80));

  AGENT.cleanup();
  assert.strictEqual(clickCount, 0, "Không được click đáp án hoặc nút chuyển câu sau khi đã tắt Mod");
  assert.strictEqual(statusAfterDisable.length, 0, "Không được gửi syncStatus ghi đè sau khi đã tắt Mod");
  assert.strictEqual(AGENT.getDiagnostics().isProcessing, false);
});

test("28. Single-Step đề thi có nút 'Câu tiếp': chỉ bấm Câu tiếp ĐÚNG 1 lần, không nhảy cóc qua Câu 2", async () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const origSetTimeout = global.setTimeout;
  const solvedQuestions = [];
  const events = [];
  let q1NextClicks = 0;
  let q2NextClicks = 0;
  let qStemEl;
  let optBtns = [];

  const loaded = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "solveQuiz") {
      solvedQuestions.push(args.rawScreenText);
      const tag = args.rawScreenText.includes("Nội dung mới") ? "Q2" : "Q1";
      events.push(`solve:${tag}`);
      return { success: true, result: { normalizedAns: "A", confidence: 95 } };
    }
    return null;
  });
  loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));
  loaded.AGENT._internalForTest.resetState();

  const renderQuestion = (qNum, title) => {
    doc.body.childNodes = [];
    optBtns = ["A", "B", "C", "D"].map((L, i) => {
      const btn = el(doc, "button", { text: `${L}. Đáp án ${L} (C${qNum})`, rect: { top: 150 + i * 50, left: 10, width: 340, height: 42 } });
      btn.addEventListener("click", () => btn.setAttribute("class", "selected"));
      return btn;
    });
    const nextBtn = el(doc, "button", { text: "Câu tiếp", rect: { top: 400, left: 10, width: 160, height: 42 } });
    nextBtn.addEventListener("click", () => {
      events.push(`next:${qNum}`);
      if (qNum === 1) {
        q1NextClicks += 1;
        renderQuestion(2, "Câu 2: Nội dung mới");
      } else {
        q2NextClicks += 1;
      }
    });
    qStemEl = el(doc, "p", { text: title });
    doc.body.appendChild(
      el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 400 } }, [qStemEl, ...optBtns, nextBtn])
    );
  };

  renderQuestion(1, "Câu 1: Nội dung đầu tiên");
  loaded.AGENT._internalForTest.processScreen(false);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => origSetTimeout(r, 15));
    if (solvedQuestions.length >= 2 && !loaded.AGENT.getDiagnostics().isProcessing) break;
  }
  loaded.AGENT.cleanup();

  assert.strictEqual(q1NextClicks, 1, "Chỉ được bấm nút Câu tiếp của Câu 1 đúng 1 lần");
  assert.strictEqual(q2NextClicks, 1, "Câu 2 được giải xong mới bấm Câu tiếp 1 lần");
  assert.deepStrictEqual(events, [
    "solve:Q1",
    "next:1",
    "solve:Q2",
    "next:2"
  ]);
});

test("29. Single-Step 2 bước ('Trả lời' -> 'Tiếp tục') & khóa SPA onRouteChanged khi đang tự chuyển câu", async () => {
  const { doc, env } = createTestEnvironment({
    innerWidth: 390,
    innerHeight: 844,
    url: "https://app.onluyen.vn/practice/step1"
  });
  const origSetTimeout = global.setTimeout;
  const solvedQuestions = [];
  let submitClicks = 0;
  let continueClicks = 0;
  let routeDeferredDuringAdvance = false;

  const loaded = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "solveQuiz") {
      solvedQuestions.push(args.rawScreenText);
      return { success: true, result: { normalizedAns: "B", confidence: 95 } };
    }
    return null;
  });
  loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));
  loaded.AGENT._internalForTest.resetState();

  const renderQ2 = () => {
    doc.body.childNodes = [];
    const btns = ["A", "B", "C", "D"].map((L, i) => {
      const btn = el(doc, "button", { text: `${L}. C2-${L}`, rect: { top: 150 + i * 50, left: 10, width: 340, height: 42 } });
      btn.addEventListener("click", () => btn.setAttribute("class", "selected"));
      return btn;
    });
    const submitBtn2 = el(doc, "button", { text: "Trả lời", rect: { top: 400, left: 10, width: 140, height: 42 } });
    submitBtn2.addEventListener("click", () => {
      submitClicks += 1;
      loaded.AGENT.updateConfig({ autoAdvanceEnabled: false });
    });
    doc.body.appendChild(
      el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 400 } }, [
        el(doc, "p", { text: "Câu 2: Màn hình hai" }),
        ...btns,
        submitBtn2
      ])
    );
  };

  const renderExplanation1 = () => {
    doc.body.childNodes = [];
    const contBtn = el(doc, "button", { text: "Tiếp tục", rect: { top: 420, left: 10, width: 160, height: 42 } });
    contBtn.addEventListener("click", () => {
      continueClicks += 1;
      const rRes = loaded.AGENT.onRouteChanged("https://app.onluyen.vn/practice/step2");
      if (rRes.deferredToAdvance) routeDeferredDuringAdvance = true;
      renderQ2();
    });
    doc.body.appendChild(
      el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 420 } }, [
        el(doc, "p", { text: "Câu 1: Màn hình một" }),
        el(doc, "p", { text: "Đáp án đúng: B" }),
        contBtn
      ])
    );
  };

  const q1Btns = ["A", "B", "C", "D"].map((L, i) => {
    const btn = el(doc, "button", { text: `${L}. C1-${L}`, rect: { top: 150 + i * 50, left: 10, width: 340, height: 42 } });
    btn.addEventListener("click", () => btn.setAttribute("class", "selected"));
    return btn;
  });
  const submitBtn1 = el(doc, "button", { text: "Trả lời", rect: { top: 400, left: 10, width: 140, height: 42 } });
  submitBtn1.addEventListener("click", () => {
    submitClicks += 1;
    renderExplanation1();
  });
  doc.body.appendChild(
    el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 400 } }, [
      el(doc, "p", { text: "Câu 1: Màn hình một" }),
      ...q1Btns,
      submitBtn1
    ])
  );

  loaded.AGENT._internalForTest.processScreen(false);
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => origSetTimeout(r, 15));
    if (solvedQuestions.length >= 2 && submitClicks >= 2) break;
  }
  loaded.AGENT.cleanup();

  assert.strictEqual(continueClicks, 1);
  assert.strictEqual(routeDeferredDuringAdvance, true, "onRouteChanged khi isSelfAdvancing phải nhường advanceSingleStep");
  assert.strictEqual(solvedQuestions.length, 2);
});

test("30. clickMCQ chỉ click ĐÚNG 1 lần, bảo vệ auto-advance khi click & fingerprint theo nội dung câu hỏi", async () => {
  // 30a: clickMCQ chọn đúng ngay lần 1 -> 1 click duy nhất (không bão click lồng nhau)
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const loaded = loadModulesInEnv(env, async () => null);

  let rowClickCount = 0;
  let innerRadioClicks = 0;
  const rowA = el(doc, "div", { className: "opt-row", rect: { top: 160, left: 10, width: 350, height: 44 } }, [
    el(doc, "input", { type: "radio", rect: { top: 170, left: 16, width: 18, height: 18 } }),
    el(doc, "span", { text: "A", rect: { top: 170, left: 42, width: 20, height: 22 } }),
    el(doc, "span", { text: "Đáp án 1", rect: { top: 170, left: 70, width: 200, height: 22 } })
  ]);
  rowA.addEventListener("click", () => {
    rowClickCount += 1;
    rowA.setAttribute("class", "opt-row selected");
  });
  rowA.querySelector("input").addEventListener("click", () => {
    innerRadioClicks += 1;
  });

  const allRows = [rowA];
  ["B", "C", "D"].forEach((L, i) => {
    allRows.push(
      el(doc, "div", { className: "opt-row", rect: { top: 215 + i * 50, left: 10, width: 350, height: 44 } }, [
        el(doc, "input", { type: "radio", rect: { top: 225 + i * 50, left: 16, width: 18, height: 18 } }),
        el(doc, "span", { text: L, rect: { top: 225 + i * 50, left: 42, width: 20, height: 22 } }),
        el(doc, "span", { text: `Đáp án ${i + 2}`, rect: { top: 225 + i * 50, left: 70, width: 200, height: 22 } })
      ])
    );
  });
  doc.body.appendChild(el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 400 } }, ["Câu hỏi:", ...allRows]));

  const cls = loaded.EXT.classifyQuestionInScope(doc, true);
  const outcome = await new Promise((resolve) => {
    loaded.AGENT._internalForTest.applyAnswerToDOM("MCQ", "A", null, cls.mcq, null, null, resolve);
  });
  assert.strictEqual(outcome.autoAdvanced, false);
  assert.strictEqual(innerRadioClicks, 1, "Chỉ click 1 target radio");
  assert.strictEqual(rowClickCount, 1, "Sự kiện click nổi bọt lên row đúng 1 lần (không nhân bản click)");

  // 30b: Nếu click MCQ tự chuyển sang Câu 2 (row bị tháo khỏi DOM), KHÔNG được click lại hay click nhầm
  rowA.remove();
  let autoOutcome = null;
  const envB = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const loadedB = loadModulesInEnv(envB.env, async () => null);
  let btnBClicks = 0;
  const rowsB = ["A", "B", "C", "D"].map((L, i) => {
    const btn = el(envB.doc, "button", { text: `${L}. Lựa chọn ${L}`, rect: { top: 150 + i * 50, left: 10, width: 340, height: 42 } });
    if (L === "A") {
      btn.addEventListener("click", () => {
        btnBClicks += 1;
        // Giả lập web tự đổi sang câu khác ngay khi bấm (tháo node câu cũ khỏi DOM)
        btn.isConnected = false;
      });
    }
    return btn;
  });
  envB.doc.body.appendChild(el(envB.doc, "div", { rect: { top: 80, left: 10, width: 360, height: 360 } }, ["Câu X:", ...rowsB]));
  const clsB = loadedB.EXT.classifyQuestionInScope(envB.doc, true);
  autoOutcome = await new Promise((resolve) => {
    loadedB.AGENT._internalForTest.applyAnswerToDOM("MCQ", "A", null, clsB.mcq, null, null, resolve);
  });
  assert.strictEqual(btnBClicks, 1);
  assert.strictEqual(autoOutcome.autoAdvanced, true);

  // 30c: Content fingerprint không phụ thuộc qCode/timer
  const fp1 = loaded.AGENT._internalForTest.computeQuestionFingerprint("MCQ", { stemText: "Đề bài giống nhau", extraDetails: "A. 1", visualSignature: "" });
  const fp2 = loaded.AGENT._internalForTest.computeQuestionFingerprint("MCQ", { stemText: "Đề bài giống nhau", extraDetails: "A. 1", visualSignature: "" });
  assert.strictEqual(fp1, fp2);
});

test("31. MutationObserver bỏ qua nhịp đồng hồ đếm ngược (00:44:59 -> 00:44:58) để tránh lag WebView", () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const { AGENT } = loadModulesInEnv(env, async () => null);

  const timerSpan = el(doc, "span", { text: "00:44:58" });
  const headerTimer = el(doc, "header", { rect: { top: 0, left: 0, width: 390, height: 50 } }, [timerSpan]);
  const questionBtn = el(doc, "button", { text: "A. Nội dung mới", rect: { top: 180, left: 10, width: 340, height: 42 } });
  const mainWrap = el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 400 } }, [questionBtn]);
  doc.body.appendChild(headerTimer);
  doc.body.appendChild(mainWrap);

  const timerMutation = [{ target: timerSpan, addedNodes: [] }];
  const realQuestionMutation = [{ target: mainWrap, addedNodes: [questionBtn] }];

  assert.strictEqual(AGENT._internalForTest.isTimerOnlyMutationList(timerMutation), true);
  assert.strictEqual(AGENT._internalForTest.isTimerOnlyMutationList(realQuestionMutation), false);
});

test("32. getMultiBlocks bắt định dạng 'Câu: 1 #13153797' và extractQuestionPayload cắt sạch tiền tố 'Câu: 1'", () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const { EXT } = loadModulesInEnv(env);

  const makeBlock = (num, code, stem, optLabel) => {
    const opts = ["A", "B", "C", "D"].map((L, idx) =>
      el(doc, "div", { rect: { top: 200 + num * 300 + idx * 45, left: 12, width: 350, height: 38 } }, [
        el(doc, "span", { text: L, rect: { top: 200 + num * 300 + idx * 45, left: 16, width: 22, height: 22 } }),
        el(doc, "span", { text: `${optLabel} ${L}`, rect: { top: 200 + num * 300 + idx * 45, left: 46, width: 240, height: 24 } })
      ])
    );
    return el(doc, "div", { rect: { top: 80 + num * 300, left: 10, width: 370, height: 280 } }, [
      el(doc, "div", { text: `Câu: ${num} #${code} | Báo lỗi`, rect: { top: 80 + num * 300, left: 10, width: 340, height: 24 } }),
      el(doc, "p", { text: stem }),
      ...opts
    ]);
  };

  doc.body.appendChild(makeBlock(1, "13153797", "Cho tập hợp A, tìm B\\A.", "Tập"));
  doc.body.appendChild(makeBlock(2, "13153798", "Tính giá trị biểu thức M.", "Số"));

  const blocks = EXT.getMultiBlocks(doc);
  assert.strictEqual(blocks.length, 2);
  assert.strictEqual(blocks[0].qNum, 1);
  assert.strictEqual(blocks[1].qNum, 2);

  const cls1 = EXT.classifyQuestionInScope(blocks[0].blockEl, true);
  const payload1 = EXT.extractQuestionPayload(blocks[0].blockEl, cls1);
  assert.ok(payload1.stemText.includes("Cho tập hợp A"));
  assert.ok(!/^Câu\s*:\s*1/i.test(payload1.stemText));
});

test("33. Angular card lồng nhau (.col-12 > .answer-card[cursor:pointer] > .badge): chọn đúng 1 click & fallback cascade", async () => {
  // 33a: badge C nằm trong .answer-card (rowEl là .col-12), click đúng .answer-card ngay lần đầu
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const { EXT, AGENT } = loadModulesInEnv(env, async () => null);
    let cardCClicks = 0;

    const listWrap = el(doc, "div", { rect: { top: 140, left: 10, width: 370, height: 260 } });
    ["A", "B", "C", "D"].forEach((L, i) => {
      const y = 150 + i * 55;
      const badge = el(doc, "span", { className: "badge", text: L, rect: { top: y + 10, left: 22, width: 24, height: 24 } });
      const card = el(doc, "div", {
        className: "answer-card",
        cs: { cursor: "pointer" },
        rect: { top: y, left: 14, width: 350, height: 48 }
      }, [
        badge,
        el(doc, "span", { text: `Nội dung ${L}`, rect: { top: y + 10, left: 56, width: 200, height: 24 } })
      ]);
      if (L === "C") {
        card.addEventListener("click", () => {
          cardCClicks += 1;
          card.setAttribute("class", "answer-card selected");
        });
      }
      const col = el(doc, "div", { className: "col-12", rect: { top: y, left: 10, width: 366, height: 50 } }, [
        card,
        el(doc, "span", { text: "helper", rect: { top: y, left: 360, width: 4, height: 4 } })
      ]);
      listWrap.appendChild(col);
    });
    doc.body.appendChild(el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 360 } }, ["Đề:", listWrap]));

    const cls = EXT.classifyQuestionInScope(doc, true);
    assert.strictEqual(cls.type, "MCQ");
    const outcome = await new Promise((resolve) => {
      AGENT._internalForTest.applyAnswerToDOM("MCQ", "C", null, cls.mcq, null, null, resolve);
    });
    assert.strictEqual(cardCClicks, 1, "Chỉ click 1 lần đúng vào .answer-card");
    assert.strictEqual(outcome.verified, true);
    assert.strictEqual(EXT.detectUIAns("MCQ", cls.mcq, null, null), "C");
  }

  // 33b: Có thẻ <label> lớn bên trong .col-12 không bắt sự kiện -> cascade tự chuyển xuống .answer-card và vẫn chọn đúng C
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const origSetTimeout = global.setTimeout;
    const { EXT, AGENT, sandbox } = loadModulesInEnv(env, async () => null);
    sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 10)));
    let decoyClicks = 0;
    let cardCClicks = 0;

    const listWrap = el(doc, "div", { rect: { top: 140, left: 10, width: 370, height: 260 } });
    ["A", "B", "C", "D"].forEach((L, i) => {
      const y = 150 + i * 55;
      const badge = el(doc, "span", { className: "badge", text: L, rect: { top: y + 10, left: 22, width: 24, height: 24 } });
      const card = el(doc, "div", {
        className: "answer-card",
        cs: { cursor: "pointer" },
        rect: { top: y, left: 14, width: 350, height: 48 }
      }, [
        badge,
        el(doc, "span", { text: `Phương án ${L}`, rect: { top: y + 10, left: 56, width: 200, height: 24 } })
      ]);
      const decoyLbl = el(doc, "label", { text: "", rect: { top: y, left: 14, width: 120, height: 24 } });
      if (L === "C") {
        decoyLbl.addEventListener("click", () => {
          decoyClicks += 1; // không thêm selected
        });
        card.addEventListener("click", () => {
          cardCClicks += 1;
          card.setAttribute("class", "answer-card selected");
        });
      }
      const col = el(doc, "div", { className: "col-12", rect: { top: y, left: 10, width: 366, height: 50 } }, [
        decoyLbl,
        card
      ]);
      listWrap.appendChild(col);
    });
    doc.body.appendChild(el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 360 } }, ["Đề:", listWrap]));

    const cls = EXT.classifyQuestionInScope(doc, true);
    const outcome = await new Promise((resolve) => {
      AGENT._internalForTest.applyAnswerToDOM("MCQ", "C", null, cls.mcq, null, null, resolve);
    });
    assert.strictEqual(decoyClicks, 1);
    assert.strictEqual(cardCClicks, 1);
    assert.strictEqual(outcome.verified, true);
    assert.strictEqual(EXT.detectUIAns("MCQ", cls.mcq, null, null), "C");
  }
});

test("34. Single-Step khi chưa thấy nút chuyển & maxQ=0 không báo hoàn thành giả; findActionButtons bắt 'Câu tiếp theo' & icon-only", async () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const origSetTimeout = global.setTimeout;
  let completedEvents = 0;
  const statuses = [];

  const loaded = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "onQuizCompleted") completedEvents += 1;
    if (handler === "syncStatus") statuses.push(args?.solverStatus || "");
    if (handler === "solveQuiz") {
      return { success: true, result: { normalizedAns: "A", confidence: 96 } };
    }
    return null;
  });
  loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));
  loaded.AGENT._internalForTest.resetState();

  const opts = ["A", "B", "C", "D"].map((L, i) => {
    const b = el(doc, "button", { text: `${L}. Lựa chọn ${L}`, rect: { top: 150 + i * 50, left: 10, width: 340, height: 42 } });
    b.addEventListener("click", () => b.setAttribute("class", "selected"));
    return b;
  });
  doc.body.appendChild(el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 350 } }, ["Câu: 1 #13153797", ...opts]));

  loaded.AGENT._internalForTest.processScreen(false);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => origSetTimeout(r, 15));
    if (!loaded.AGENT.getDiagnostics().isProcessing && !loaded.AGENT.getDiagnostics().isSelfAdvancing) break;
  }
  loaded.AGENT.cleanup();

  assert.strictEqual(completedEvents, 0, "Không được bắn onQuizCompleted giả ở Câu 1 khi không thấy nút chuyển & maxQ=0");
  assert.ok(!statuses.some((s) => s.includes("Đã hoàn thành toàn bộ đề")));
  assert.ok(statuses.some((s) => s.includes("Chưa thấy nút chuyển câu")));

  // Kiểm tra findActionButtons nhận diện "Câu tiếp theo" và nút icon-only aria-label / chevron
  const envBtn = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const loadedBtn = loadModulesInEnv(envBtn.env, async () => null);
  const textNext = el(envBtn.doc, "button", { text: "Câu tiếp theo", rect: { top: 600, left: 200, width: 140, height: 40 } });
  envBtn.doc.body.appendChild(textNext);
  assert.strictEqual(loadedBtn.AGENT._internalForTest.findActionButtons(envBtn.doc).nextBtn, textNext);

  envBtn.doc.body.removeChild(textNext);
  const backBtn = el(envBtn.doc, "button", { attrs: { "aria-label": "Câu trước" }, rect: { top: 600, left: 20, width: 44, height: 40 } }, [
    el(envBtn.doc, "i", { className: "fa fa-chevron-left" })
  ]);
  const iconNext = el(envBtn.doc, "button", { attrs: { "aria-label": "Câu tiếp" }, rect: { top: 600, left: 300, width: 44, height: 40 } }, [
    el(envBtn.doc, "i", { className: "fa fa-chevron-right" })
  ]);
  envBtn.doc.body.appendChild(backBtn);
  envBtn.doc.body.appendChild(iconNext);
  assert.strictEqual(loadedBtn.AGENT._internalForTest.findActionButtons(envBtn.doc).nextBtn, iconNext);
});

test("35. OnLuyen Mobile UI ('<div> 01:26:41 ↑' + 'Câu: 1 #13153797 | Báo lỗi | Đánh dấu'): không rò đồng hồ, chọn đúng C, 0 vòng lặp", async () => {
  const { doc, env } = createTestEnvironment({
    innerWidth: 390,
    innerHeight: 844,
    url: "https://app.onluyen.vn/doing/13153797"
  });
  const origSetTimeout = global.setTimeout;
  let solveCalls = 0;

  let resolveSolve = null;
  const loaded = loadModulesInEnv(env, async (handler) => {
    if (handler === "solveQuiz") {
      solveCalls += 1;
      return new Promise((resolve) => {
        resolveSolve = resolve;
      });
    }
    return null;
  });
  loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));
  loaded.AGENT._internalForTest.resetState();

  const timerSpan = el(doc, "span", { text: "01:26:41", rect: { top: 14, left: 150, width: 80, height: 22 } });
  const topBarDiv = el(doc, "div", { className: "mobile-exam-bar", rect: { top: 0, left: 0, width: 390, height: 54 } }, [
    el(doc, "button", { text: "☰", rect: { top: 10, left: 12, width: 34, height: 34 } }),
    timerSpan,
    el(doc, "button", { text: "↑", rect: { top: 10, left: 340, width: 34, height: 34 } })
  ]);
  assert.strictEqual(loaded.EXT.isNavPanelContainer(topBarDiv), true, "Top bar div chứa 01:26:41 phải bị lọc như chrome/nav");

  const cards = [];
  const optionRows = ["A", "B", "C", "D"].map((L, i) => {
    const y = 240 + i * 68;
    const badge = el(doc, "span", { className: "opt-badge", text: L, rect: { top: y + 14, left: 26, width: 28, height: 28 } });
    const card = el(doc, "div", {
      className: "answer-item-box",
      cs: { cursor: "pointer" },
      rect: { top: y, left: 14, width: 356, height: 58 }
    }, [
      badge,
      el(doc, "span", { text: `B\\A = {${i + 1}}.`, rect: { top: y + 14, left: 66, width: 220, height: 26 } })
    ]);
    card.addEventListener("click", () => {
      cards.forEach((c) => c.setAttribute("class", "answer-item-box"));
      card.setAttribute("class", "answer-item-box selected");
    });
    cards.push(card);
    return el(doc, "div", { className: "col-12", rect: { top: y, left: 10, width: 370, height: 62 } }, [card]);
  });

  const qCard = el(doc, "div", { rect: { top: 64, left: 10, width: 370, height: 520 } }, [
    el(doc, "div", { text: "Câu: 1 #13153797 | Báo lỗi | Đánh dấu", rect: { top: 72, left: 12, width: 350, height: 28 } }),
    el(doc, "p", { text: "Cho hai tập hợp: A = {0; 2; 5}, B = {2; 4; 6; 8}. Tìm B\\A.", rect: { top: 112, left: 12, width: 350, height: 60 } }),
    ...optionRows
  ]);
  doc.body.appendChild(topBarDiv);
  doc.body.appendChild(qCard);

  const cls0 = loaded.EXT.classifyQuestionInScope(doc, true);
  const p0 = loaded.EXT.extractQuestionPayload(doc, cls0);
  assert.ok(!/01:26:\d{2}/.test(p0.stemText), "stemText không được dính đồng hồ 01:26:41");
  assert.ok(!/Báo lỗi|Đánh dấu/.test(p0.stemText), "stemText không được dính Báo lỗi | Đánh dấu");

  const startRes = loaded.AGENT._internalForTest.processScreen(false);
  assert.strictEqual(startRes.reason, "solving_started");

  for (let i = 0; i < 20 && !resolveSolve; i++) {
    await new Promise((r) => origSetTimeout(r, 10));
  }
  assert.ok(resolveSolve, "Phải gọi solveQuiz");

  // Đồng hồ nhảy giây trong lúc AI đang giải và sau khi giải xong
  timerSpan.textContent = "01:26:40";
  doc.body.appendChild(el(doc, "span", { text: "01:26:40" })); // giả lập text node nhảy giây nếu lọt vào body
  resolveSolve({ success: true, result: { normalizedAns: "C", confidence: 100 } });

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => origSetTimeout(r, 15));
    if (!loaded.AGENT.getDiagnostics().isProcessing && !loaded.AGENT.getDiagnostics().isSelfAdvancing) break;
  }

  assert.strictEqual(loaded.EXT.detectUIAns("MCQ", cls0.mcq, null, null), "C", "Phải tích được đáp án C dù đồng hồ nhảy giây");
  assert.strictEqual(loaded.AGENT.getDiagnostics().lastClick?.verified, true);
  assert.strictEqual(loaded.AGENT.getDiagnostics().lastClick?.via, "detectUIAns");

  timerSpan.textContent = "01:26:39";
  const rescan1 = loaded.AGENT._internalForTest.processScreen(false);
  const rescan2 = loaded.AGENT._internalForTest.processScreen(false);
  loaded.AGENT.cleanup();

  assert.strictEqual(rescan1.reason, "already_solved_sig");
  assert.strictEqual(rescan2.reason, "already_solved_sig");
  assert.strictEqual(solveCalls, 1, "Tuyệt đối chỉ gọi solveQuiz đúng 1 lần, không mắc kẹt vòng lặp");
});

test("36. Xác nhận chọn qua snapshotDiff (class Tailwind 'bg-blue-500 border-primary') & cascade qua ứng viên thứ 4-5 (<input> ẩn)", async () => {
  // 36a: Class lạ bg-blue-500 border-primary được xác nhận đúng ngay lần click đầu qua snapshotDiff
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const origSetTimeout = global.setTimeout;
    const { EXT, AGENT, sandbox } = loadModulesInEnv(env, async () => null);
    sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));

    let cClicks = 0;
    const rows = ["A", "B", "C", "D"].map((L, i) => {
      const y = 140 + i * 54;
      const card = el(doc, "div", {
        className: "p-3 rounded border",
        cs: { cursor: "pointer" },
        rect: { top: y, left: 12, width: 350, height: 46 }
      }, [
        el(doc, "span", { text: L, rect: { top: y + 10, left: 22, width: 22, height: 22 } }),
        el(doc, "span", { text: `Đáp án ${L}`, rect: { top: y + 10, left: 52, width: 220, height: 22 } })
      ]);
      if (L === "C") {
        card.addEventListener("click", () => {
          cClicks += 1;
          card.setAttribute("class", "p-3 rounded bg-blue-500 border-primary");
        });
      }
      return card;
    });
    doc.body.appendChild(el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 340 } }, ["Đề bài:", ...rows]));

    const cls = EXT.classifyQuestionInScope(doc, true);
    const outcome = await new Promise((resolve) => {
      AGENT._internalForTest.applyAnswerToDOM("MCQ", "C", null, cls.mcq, null, null, resolve);
    });
    assert.strictEqual(cClicks, 1, "Chỉ click 1 lần, không click lại làm bỏ chọn");
    assert.strictEqual(outcome.verified, true);
    assert.strictEqual(outcome.autoAdvanced, false);
    assert.strictEqual(AGENT.getDiagnostics().lastClick?.via, "snapshotDiff");
  }

  // 36b: Ứng viên 1,2,3 (decoy label, card, badge) không ăn -> cascade tới ứng viên thứ 5 (input[type=radio] ẩn) thành công
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const origSetTimeout = global.setTimeout;
    const { EXT, AGENT, sandbox } = loadModulesInEnv(env, async () => null);
    sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));

    let radioClicks = 0;
    const rows = ["A", "B", "C", "D"].map((L, i) => {
      const y = 140 + i * 56;
      const decoyLbl = el(doc, "label", { text: "", rect: { top: y, left: 12, width: 120, height: 20 } });
      const badge = el(doc, "span", { text: L, rect: { top: y + 12, left: 24, width: 22, height: 22 } });
      const card = el(doc, "div", {
        className: "answer-card",
        cs: { cursor: "pointer" },
        rect: { top: y + 4, left: 14, width: 340, height: 46 }
      }, [badge, el(doc, "span", { text: `Mục ${L}`, rect: { top: y + 12, left: 56, width: 200, height: 22 } })]);
      const hiddenRadio = el(doc, "input", { type: "radio", style: { opacity: "0" }, rect: { top: y + 14, left: 14, width: 16, height: 16 } });
      if (L === "C") {
        hiddenRadio.addEventListener("click", () => {
          radioClicks += 1;
          hiddenRadio.checked = true;
        });
      }
      return el(doc, "div", { className: "row-wrapper", rect: { top: y, left: 10, width: 360, height: 52 } }, [
        decoyLbl,
        card,
        hiddenRadio
      ]);
    });
    doc.body.appendChild(el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 340 } }, ["Đề:", ...rows]));

    const cls = EXT.classifyQuestionInScope(doc, true);
    const cands = AGENT._internalForTest.getMcqClickCandidates(cls.mcq[2], doc);
    assert.ok(cands.length >= 5, `Phải có đủ ứng viên tới input ẩn (thực tế: ${cands.length})`);

    const outcome = await new Promise((resolve) => {
      AGENT._internalForTest.applyAnswerToDOM("MCQ", "C", null, cls.mcq, null, null, resolve);
    });
    assert.strictEqual(radioClicks, 1);
    assert.strictEqual(outcome.verified, true);
    assert.strictEqual(EXT.detectUIAns("MCQ", cls.mcq, null, null), "C");
    assert.strictEqual(AGENT.getDiagnostics().lastClick?.attempts, 5);
  }
});

test("37. Circuit breaker chống vòng lặp khi click thất bại toàn bộ (verified=false) & mở lại khi bấm Quét ngay", async () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const origSetTimeout = global.setTimeout;
  let solveCalls = 0;
  let nextClicks = 0;
  const statuses = [];

  const loaded = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "solveQuiz") {
      solveCalls += 1;
      return { success: true, result: { normalizedAns: "B", confidence: 92 } };
    }
    if (handler === "syncStatus") {
      statuses.push(args?.solverStatus || "");
    }
    return null;
  });
  loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));
  loaded.AGENT._internalForTest.resetState();

  const opts = ["A", "B", "C", "D"].map((L, i) =>
    el(doc, "button", { text: `${L}. Phương án ${L}`, rect: { top: 160 + i * 48, left: 10, width: 340, height: 40 } })
  );
  const nextBtn = el(doc, "button", { text: "Câu tiếp", rect: { top: 380, left: 120, width: 140, height: 40 } });
  nextBtn.addEventListener("click", () => {
    nextClicks += 1;
  });
  doc.body.appendChild(el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 360 } }, ["Câu: 1 #99887766", ...opts, nextBtn]));

  const firstRun = loaded.AGENT._internalForTest.processScreen(false);
  assert.strictEqual(firstRun.reason, "solving_started");

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => origSetTimeout(r, 15));
    if (!loaded.AGENT.getDiagnostics().isProcessing && !loaded.AGENT.getDiagnostics().isSelfAdvancing) break;
  }

  assert.strictEqual(nextClicks, 0, "Không được tự bấm Câu tiếp khi chưa chọn được đáp án");
  assert.ok(statuses.some((s) => s.includes("web chưa nhận click")), "Phải báo rõ trạng thái cảnh báo chưa nhận click");
  assert.strictEqual(loaded.AGENT.getDiagnostics().lastClick?.verified, false);

  // Quét lại thụ động nhiều lần không được giải lại câu này
  assert.strictEqual(loaded.AGENT._internalForTest.processScreen(false).reason, "already_solved_sig");
  assert.strictEqual(loaded.AGENT._internalForTest.processScreen(false).reason, "already_solved_sig");
  assert.strictEqual(solveCalls, 1, "Circuit breaker phải khóa ở 1 lần solveQuiz");

  // Người dùng chủ động bấm Quét ngay -> cho phép giải lại
  loaded.AGENT.forceScanNow();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => origSetTimeout(r, 15));
    if (!loaded.AGENT.getDiagnostics().isProcessing) break;
  }
  loaded.AGENT.cleanup();
  assert.strictEqual(solveCalls, 2);
});

test("38. Nút 'TRẢ LỜI' -> 'TIẾP TỤC' lồng trong div + bottom <nav fixed>: chọn đúng nút trong, không nhảy cóc", async () => {
  const { doc, env } = createTestEnvironment({
    innerWidth: 390,
    innerHeight: 844,
    url: "https://app.onluyen.vn/practice/step-mobile-1"
  });
  const origSetTimeout = global.setTimeout;
  const solvedQuestions = [];
  let q1AdvSnapshot = null;
  let outerFooterClicks = 0;
  let q1SubmitClicks = 0;
  let q1ContinueClicks = 0;
  let q2SubmitClicks = 0;

  const loaded = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "solveQuiz") {
      solvedQuestions.push(args.rawScreenText);
      if (args.rawScreenText.includes("Tìm nghiệm x.")) {
        q1AdvSnapshot = loaded.AGENT.getDiagnostics().lastAdvance;
      }
      return { success: true, result: { normalizedAns: "C", confidence: 98 } };
    }
    return null;
  });
  loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));
  loaded.AGENT._internalForTest.resetState();

  const buildBottomNav = (innerNode) =>
    el(
      doc,
      "nav",
      {
        className: "bottom-nav",
        cs: { position: "fixed" },
        style: { position: "fixed" },
        rect: { top: 770, left: 0, width: 390, height: 64 }
      },
      [innerNode]
    );

  // Kiểm tra findActionButtons chọn .btn-submit bên trong thay vì .footer-wrap bọc ngoài
  const spanLabel1 = el(doc, "span", {
    text: "  Trả \n lời  ",
    rect: { top: 790, left: 150, width: 90, height: 22 }
  });
  const btnSubmit1 = el(
    doc,
    "div",
    {
      className: "btn-submit rounded-full",
      cs: { cursor: "pointer" },
      rect: { top: 780, left: 32, width: 326, height: 44 }
    },
    [spanLabel1]
  );
  const footerWrap1 = el(
    doc,
    "div",
    { className: "footer-wrap", rect: { top: 774, left: 12, width: 366, height: 56 } },
    [btnSubmit1]
  );
  footerWrap1.addEventListener("click", () => {
    outerFooterClicks += 1;
  });

  const renderQ2 = () => {
    doc.body.childNodes = [];
    const btns2 = ["A", "B", "C", "D"].map((L, i) => {
      const b = el(doc, "div", {
        className: "answer-card",
        cs: { cursor: "pointer" },
        rect: { top: 180 + i * 56, left: 16, width: 358, height: 46 }
      }, [
        el(doc, "span", { text: L, rect: { top: 190 + i * 56, left: 28, width: 22, height: 22 } }),
        el(doc, "span", { text: `C2-${L}`, rect: { top: 190 + i * 56, left: 60, width: 200, height: 22 } })
      ]);
      b.addEventListener("click", () => {
        btns2.forEach((x) => x.setAttribute("class", "answer-card"));
        b.setAttribute("class", "answer-card selected");
      });
      return b;
    });
    const submit2 = el(
      doc,
      "div",
      { className: "btn-submit", cs: { cursor: "pointer" }, rect: { top: 780, left: 32, width: 326, height: 44 } },
      [el(doc, "span", { text: "TRẢ LỜI", rect: { top: 790, left: 150, width: 90, height: 22 } })]
    );
    submit2.addEventListener("click", () => {
      q2SubmitClicks += 1;
      loaded.AGENT.updateConfig({ autoAdvanceEnabled: false });
    });
    doc.body.appendChild(
      el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 420 } }, [
        el(doc, "p", { text: "Câu 2: Tìm nghiệm x." }),
        ...btns2
      ])
    );
    doc.body.appendChild(buildBottomNav(submit2));
  };

  btnSubmit1.addEventListener("click", () => {
    q1SubmitClicks += 1;
    // Giả lập OnLuyen giữ nguyên khung câu 1 nhưng hiện lời giải + nút TIẾP TỤC trong bottom-nav
    const navChildren = doc.body.childNodes.slice(0, 1);
    doc.body.childNodes = [];
    navChildren[0].appendChild(el(doc, "p", { text: "Đáp án đúng: C" }));
    doc.body.appendChild(navChildren[0]);

    const contSpan = el(doc, "span", { text: "TIẾP TỤC", rect: { top: 790, left: 150, width: 90, height: 22 } });
    const contDiv = el(
      doc,
      "div",
      { className: "btn-continue", cs: { cursor: "pointer" }, rect: { top: 780, left: 32, width: 326, height: 44 } },
      [contSpan]
    );
    contDiv.addEventListener("click", () => {
      q1ContinueClicks += 1;
      renderQ2();
    });
    doc.body.appendChild(buildBottomNav(contDiv));
  });

  const q1Btns = ["A", "B", "C", "D"].map((L, i) => {
    const b = el(doc, "div", {
      className: "answer-card",
      cs: { cursor: "pointer" },
      rect: { top: 180 + i * 56, left: 16, width: 358, height: 46 }
    }, [
      el(doc, "span", { text: L, rect: { top: 190 + i * 56, left: 28, width: 22, height: 22 } }),
      el(doc, "span", { text: `C1-${L}`, rect: { top: 190 + i * 56, left: 60, width: 200, height: 22 } })
    ]);
    b.addEventListener("click", () => {
      q1Btns.forEach((x) => x.setAttribute("class", "answer-card"));
      b.setAttribute("class", "answer-card selected");
    });
    return b;
  });

  doc.body.appendChild(
    el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 420 } }, [
      el(doc, "p", { text: "Câu 1: Cho tập hợp A." }),
      ...q1Btns
    ])
  );
  doc.body.appendChild(buildBottomNav(footerWrap1));

  const found = loaded.AGENT._internalForTest.findActionButtons(doc);
  assert.strictEqual(found.submitBtn, btnSubmit1, "Phải chọn .btn-submit bên trong chứ không phải .footer-wrap");

  loaded.AGENT._internalForTest.processScreen(false);
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => origSetTimeout(r, 15));
    if (solvedQuestions.length >= 2 && q2SubmitClicks >= 1) break;
  }
  loaded.AGENT.cleanup();

  assert.strictEqual(btnSubmit1.scrollIntoViewCalls.length, 0, "Nút trong bottom-nav fixed không được cuộn giật trang");
  assert.strictEqual(q1SubmitClicks, 1, "Chỉ click TRẢ LỜI Câu 1 đúng 1 lần");
  assert.strictEqual(outerFooterClicks, 1, "Click nổi bọt đúng 1 lần từ .btn-submit");
  assert.strictEqual(q1ContinueClicks, 1, "Chỉ click TIẾP TỤC Câu 1 đúng 1 lần");
  assert.strictEqual(solvedQuestions.length, 2, "Phải giải cả Câu 1 và Câu 2");
  assert.strictEqual(q2SubmitClicks, 1, "Câu 2 chỉ giải xong mới click TRẢ LỜI");
  assert.strictEqual(q1AdvSnapshot?.stage, "submit->next");
  assert.strictEqual(q1AdvSnapshot?.changed, true);
});

test("39. Chờ nút 'TRẢ LỜI' mở khóa disabled & safe fallback xuống <span> con khi pill ngoài không nghe click", async () => {
  // 39a: Nút TRẢ LỜI ban đầu disabled, 900ms (ảo) sau khi chọn đáp án mới mở khóa
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const origSetTimeout = global.setTimeout;
    let submitClicks = 0;
    let solvedCount = 0;

    const loaded = loadModulesInEnv(env, async (handler) => {
      if (handler === "solveQuiz") {
        solvedCount += 1;
        return { success: true, result: { normalizedAns: "A", confidence: 95 } };
      }
      return null;
    });
    loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));
    loaded.AGENT._internalForTest.resetState();

    const submitDiv = el(doc, "div", {
      className: "btn-submit disabled",
      cs: { cursor: "pointer" },
      text: "TRẢ LỜI",
      rect: { top: 760, left: 32, width: 326, height: 44 }
    });
    submitDiv.addEventListener("click", () => {
      submitClicks += 1;
      doc.body.childNodes = [];
      doc.body.appendChild(
        el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 350 } }, [
          el(doc, "p", { text: "Câu 2: Đã chuyển câu." }),
          ...["A", "B", "C", "D"].map((L, i) =>
            el(doc, "button", { text: `${L}. X${L}`, rect: { top: 150 + i * 48, left: 12, width: 340, height: 40 } })
          )
        ])
      );
      loaded.AGENT.updateConfig({ autoAdvanceEnabled: false });
    });

    const opts = ["A", "B", "C", "D"].map((L, i) => {
      const b = el(doc, "button", {
        text: `${L}. Đáp án ${L}`,
        rect: { top: 150 + i * 48, left: 12, width: 340, height: 40 }
      });
      b.addEventListener("click", () => {
        b.setAttribute("class", "selected");
        loaded.sandbox.setTimeout(() => {
          submitDiv.setAttribute("class", "btn-submit");
        }, 900);
      });
      return b;
    });

    doc.body.appendChild(
      el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 400 } }, [
        el(doc, "p", { text: "Câu 1: Mở khóa trễ." }),
        ...opts,
        submitDiv
      ])
    );

    loaded.AGENT._internalForTest.processScreen(false);
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => origSetTimeout(r, 15));
      if (submitClicks >= 1 && !loaded.AGENT.getDiagnostics().isSelfAdvancing) break;
    }
    const adv39a = loaded.AGENT.getDiagnostics().lastAdvance;
    loaded.AGENT.cleanup();

    assert.strictEqual(solvedCount, 1);
    assert.strictEqual(submitClicks, 1, "Phải chờ nút TRẢ LỜI hết disabled rồi bấm đúng 1 lần");
    assert.strictEqual(adv39a?.changed, true);
  }

  // 39b: Listener chỉ gắn vào <span> con bên trong .btn-pill (div ngoài không có listener)
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const origSetTimeout = global.setTimeout;
    let pillClicks = 0;
    let spanClicks = 0;

    const loaded = loadModulesInEnv(env, async (handler) => {
      if (handler === "solveQuiz") {
        return { success: true, result: { normalizedAns: "B", confidence: 95 } };
      }
      return null;
    });
    loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));
    loaded.AGENT._internalForTest.resetState();

    const innerSpan = el(doc, "span", {
      text: "TRẢ LỜI",
      rect: { top: 770, left: 140, width: 100, height: 24 }
    });
    const outerPill = el(
      doc,
      "div",
      {
        className: "btn-pill",
        cs: { cursor: "pointer" },
        rect: { top: 760, left: 32, width: 326, height: 44 }
      },
      [innerSpan]
    );
    outerPill.addEventListener("click", () => {
      pillClicks += 1;
    });
    innerSpan.addEventListener("click", () => {
      spanClicks += 1;
      doc.body.childNodes = [];
      doc.body.appendChild(
        el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 350 } }, [
          el(doc, "p", { text: "Câu 2: Đã qua câu mới nhờ bấm <span>." }),
          ...["A", "B", "C", "D"].map((L, i) =>
            el(doc, "button", { text: `${L}. Y${L}`, rect: { top: 150 + i * 48, left: 12, width: 340, height: 40 } })
          )
        ])
      );
      loaded.AGENT.updateConfig({ autoAdvanceEnabled: false });
    });

    const opts = ["A", "B", "C", "D"].map((L, i) => {
      const b = el(doc, "button", {
        text: `${L}. Lựa chọn ${L}`,
        rect: { top: 150 + i * 48, left: 12, width: 340, height: 40 }
      });
      b.addEventListener("click", () => b.setAttribute("class", "selected"));
      return b;
    });

    doc.body.appendChild(
      el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 400 } }, [
        el(doc, "p", { text: "Câu 1: Listener nằm ở span con." }),
        ...opts,
        outerPill
      ])
    );

    loaded.AGENT._internalForTest.processScreen(false);
    for (let i = 0; i < 140; i++) {
      await new Promise((r) => origSetTimeout(r, 15));
      if (spanClicks >= 1 && !loaded.AGENT.getDiagnostics().isSelfAdvancing) break;
    }
    const adv39b = loaded.AGENT.getDiagnostics().lastAdvance;
    loaded.AGENT.cleanup();

    assert.strictEqual(spanClicks, 1, "Bấm đúng 1 lần vào <span> con ngay phát đầu tiên");
    assert.strictEqual(pillClicks, 1, "Click nổi bọt lên pill ngoài đúng 1 lần (không click bão)");
    assert.strictEqual(adv39b?.changed, true);
    assert.strictEqual(adv39b?.attempts, 1);
    assert.strictEqual(adv39b?.targetTag, "SPAN");
  }
});

test("40. Không bao giờ bấm nhầm nút trong modal Nộp bài; bắt TIẾP TỤC xuất hiện trễ nhưng khóa 1 lần chống lặp", async () => {
  // 40a: Modal Nộp bài ('Bạn có chắc chắn muốn nộp bài?' + 'Xác nhận'/'Nộp bài'/'Hoàn thành') bị chặn hoàn toàn
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const { AGENT } = loadModulesInEnv(env, async () => null);

    const modal = el(doc, "div", { className: "ant-modal-content", attrs: { role: "dialog" }, rect: { top: 200, left: 30, width: 330, height: 220 } }, [
      el(doc, "p", { text: "Bạn có chắc chắn muốn nộp bài?" }),
      el(doc, "button", { text: "Xác nhận", rect: { top: 340, left: 200, width: 100, height: 40 } }),
      el(doc, "button", { text: "Nộp bài", rect: { top: 340, left: 80, width: 100, height: 40 } }),
      el(doc, "button", { text: "Hoàn thành", rect: { top: 390, left: 80, width: 120, height: 36 } })
    ]);
    const topBar = el(doc, "header", { rect: { top: 0, left: 0, width: 390, height: 54 } }, [
      el(doc, "button", { text: "Tiếp tục", rect: { top: 10, left: 280, width: 90, height: 32 } })
    ]);
    const passiveText = el(doc, "div", { text: "Tiếp", rect: { top: 180, left: 20, width: 60, height: 24 } });
    doc.body.appendChild(topBar);
    doc.body.appendChild(passiveText);
    doc.body.appendChild(modal);

    const actions = AGENT._internalForTest.findActionButtons(doc);
    assert.strictEqual(actions.submitBtn, null, "Không được nhận nút Xác nhận/Nộp bài trong modal");
    assert.strictEqual(actions.nextBtn, null, "Không được nhận nút trong <header> hay text 'Tiếp' thụ động");
  }

  // 40b: Nút TIẾP TỤC xuất hiện trễ sau khi đã bấm TRẢ LỜI (không có chữ 'Đáp án đúng') chỉ bấm ĐÚNG 1 LẦN rồi khóa
  {
    const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
    const origSetTimeout = global.setTimeout;
    let lateContinueClicks = 0;

    const loaded = loadModulesInEnv(env, async (handler) => {
      if (handler === "solveQuiz") {
        return { success: true, result: { normalizedAns: "A", confidence: 97 } };
      }
      return null;
    });
    loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));
    loaded.AGENT._internalForTest.resetState();

    const submitBtn = el(doc, "div", {
      className: "btn-submit",
      cs: { cursor: "pointer" },
      text: "TRẢ LỜI",
      rect: { top: 760, left: 32, width: 326, height: 44 }
    });
    submitBtn.addEventListener("click", () => {
      submitBtn.remove();
    });

    const opts = ["A", "B", "C", "D"].map((L, i) => {
      const b = el(doc, "button", {
        text: `${L}. Phương án ${L}`,
        rect: { top: 150 + i * 48, left: 12, width: 340, height: 40 }
      });
      b.addEventListener("click", () => b.setAttribute("class", "selected"));
      return b;
    });

    const wrap = el(doc, "div", { rect: { top: 80, left: 10, width: 360, height: 400 } }, [
      el(doc, "p", { text: "Câu 1: Nút tiếp tục đến trễ." }),
      ...opts,
      submitBtn
    ]);
    doc.body.appendChild(wrap);

    loaded.AGENT._internalForTest.processScreen(false);
    for (let i = 0; i < 160; i++) {
      await new Promise((r) => origSetTimeout(r, 15));
      if (!loaded.AGENT.getDiagnostics().isProcessing && !loaded.AGENT.getDiagnostics().isSelfAdvancing) break;
    }

    const lateNext = el(doc, "div", {
      className: "next-pill",
      cs: { cursor: "pointer" },
      text: "TIẾP TỤC",
      rect: { top: 760, left: 32, width: 326, height: 44 }
    });
    lateNext.addEventListener("click", () => {
      lateContinueClicks += 1;
    });
    doc.body.appendChild(lateNext);

    const r1 = loaded.AGENT._internalForTest.processScreen(false);
    assert.strictEqual(r1.reason, "late_continue_advanced");
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => origSetTimeout(r, 15));
      if (!loaded.AGENT.getDiagnostics().isProcessing) break;
    }
    const r3 = loaded.AGENT._internalForTest.processScreen(false);
    loaded.AGENT.cleanup();

    assert.strictEqual(lateContinueClicks, 1, "Chỉ được bấm TIẾP TỤC đúng 1 lần (rồi khóa vĩnh viễn cho câu đó)");
    assert.strictEqual(r3.reason, "already_solved_sig", "Sau 1 lần không chuyển trang phải khóa chống lặp");
  }
});

test("41. Chống rối loạn chuyển câu: TRẢ LỜI phản hồi chậm 600ms + số toán học {2; 4; 6; 8} + icon chevron bẫy", async () => {
  const { doc, env } = createTestEnvironment({
    innerWidth: 390,
    innerHeight: 844,
    url: "https://app.onluyen.vn/doing/13153797"
  });
  const origSetTimeout = global.setTimeout;
  const solvedQCodes = [];
  let q1SubmitClicks = 0;
  let q1ContinueClicks = 0;
  let q2SubmitClicks = 0;
  let decoyChevronClicks = 0;
  let mathSpanClicks = 0;

  const loaded = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "solveQuiz") {
      solvedQCodes.push(args.qCode);
      return { success: true, result: { normalizedAns: args.qCode === "#13153797" ? "C" : "A", confidence: 99 } };
    }
    return null;
  });
  loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 15)));
  loaded.AGENT._internalForTest.resetState();

  const decoyChevron = el(
    doc,
    "button",
    { className: "carousel-next", rect: { top: 300, left: 330, width: 38, height: 38 } },
    [el(doc, "i", { className: "fa fa-chevron-right" })]
  );
  decoyChevron.addEventListener("click", () => {
    decoyChevronClicks += 1;
  });

  const makeBottomNav = (child) =>
    el(
      doc,
      "nav",
      {
        className: "bottom-nav",
        cs: { position: "fixed" },
        style: { position: "fixed" },
        rect: { top: 770, left: 0, width: 390, height: 64 }
      },
      [child]
    );

  const renderQ2 = () => {
    doc.body.childNodes = [];
    const cards2 = [];
    const optRows2 = ["A", "B", "C", "D"].map((L, i) => {
      const y = 220 + i * 62;
      const card = el(doc, "div", {
        className: "answer-item-box",
        cs: { cursor: "pointer" },
        rect: { top: y, left: 14, width: 356, height: 52 }
      }, [
        el(doc, "span", { className: "opt-badge", text: L, rect: { top: y + 12, left: 24, width: 26, height: 26 } }),
        el(doc, "span", { text: `${(i + 1) * 10}`, rect: { top: y + 12, left: 62, width: 200, height: 24 } })
      ]);
      card.addEventListener("click", () => {
        cards2.forEach((c) => c.setAttribute("class", "answer-item-box"));
        card.setAttribute("class", "answer-item-box selected");
      });
      cards2.push(card);
      return card;
    });
    const submit2 = el(
      doc,
      "div",
      { className: "btn-submit", cs: { cursor: "pointer" }, rect: { top: 780, left: 32, width: 326, height: 44 } },
      [el(doc, "span", { text: "TRẢ LỜI", rect: { top: 790, left: 150, width: 90, height: 22 } })]
    );
    submit2.addEventListener("click", () => {
      q2SubmitClicks += 1;
      loaded.AGENT.updateConfig({ autoAdvanceEnabled: false });
    });
    doc.body.appendChild(
      el(doc, "div", { rect: { top: 64, left: 10, width: 370, height: 520 } }, [
        el(doc, "div", { text: "Câu: 2 #13153798 | Báo lỗi | Đánh dấu", rect: { top: 72, left: 12, width: 350, height: 28 } }),
        el(doc, "p", { text: "Tính 5 + 5.", rect: { top: 112, left: 12, width: 350, height: 50 } }),
        ...optRows2
      ])
    );
    doc.body.appendChild(makeBottomNav(submit2));
  };

  const mathNums = ["4", "6", "8", "2"];
  const cards1 = [];
  const optRows1 = ["A", "B", "C", "D"].map((L, i) => {
    const y = 240 + i * 64;
    const mathSpan = el(doc, "span", {
      text: mathNums[i],
      rect: { top: y + 12, left: 120, width: 24, height: 24 }
    });
    mathSpan.addEventListener("click", () => {
      mathSpanClicks += 1;
    });
    const card = el(doc, "div", {
      className: "answer-item-box",
      cs: { cursor: "pointer" },
      rect: { top: y, left: 14, width: 356, height: 54 }
    }, [
      el(doc, "span", { className: "opt-badge", text: L, rect: { top: y + 12, left: 24, width: 26, height: 26 } }),
      el(doc, "span", { text: "B\\A = {", rect: { top: y + 12, left: 60, width: 56, height: 24 } }),
      mathSpan,
      el(doc, "span", { text: "}.", rect: { top: y + 12, left: 150, width: 20, height: 24 } })
    ]);
    card.addEventListener("click", () => {
      cards1.forEach((c) => c.setAttribute("class", "answer-item-box"));
      card.setAttribute("class", "answer-item-box selected");
    });
    cards1.push(card);
    return card;
  });

  const q1Card = el(doc, "div", { rect: { top: 64, left: 10, width: 370, height: 540 } }, [
    el(doc, "div", { text: "Câu: 1 #13153797 | Báo lỗi | Đánh dấu", rect: { top: 72, left: 12, width: 350, height: 28 } }),
    el(doc, "p", { text: "Cho A = {0; 2; 5}, B = {2; 4; 6; 8}. Tìm B\\A.", rect: { top: 112, left: 12, width: 350, height: 56 } }),
    ...optRows1,
    decoyChevron
  ]);

  const submit1 = el(
    doc,
    "div",
    { className: "btn-submit", cs: { cursor: "pointer" }, rect: { top: 780, left: 32, width: 326, height: 44 } },
    [el(doc, "span", { text: "TRẢ LỜI", rect: { top: 790, left: 150, width: 90, height: 22 } })]
  );
  const bottomNav1 = makeBottomNav(submit1);
  submit1.addEventListener("click", () => {
    q1SubmitClicks += 1;
    // Phản hồi API chậm 600ms mới hiện Đáp án đúng + TIẾP TỤC (nút TRẢ LỜI vẫn giữ nguyên trong lúc chờ)
    loaded.sandbox.setTimeout(() => {
      q1Card.appendChild(el(doc, "p", { text: "Đáp án đúng: C" }));
      bottomNav1.childNodes = [];
      const contDiv = el(
        doc,
        "div",
        { className: "btn-next", cs: { cursor: "pointer" }, rect: { top: 780, left: 32, width: 326, height: 44 } },
        [el(doc, "span", { text: "TIẾP TỤC", rect: { top: 790, left: 150, width: 90, height: 22 } })]
      );
      contDiv.addEventListener("click", () => {
        q1ContinueClicks += 1;
        renderQ2();
      });
      bottomNav1.appendChild(contDiv);
    }, 600);
  });

  doc.body.appendChild(q1Card);
  doc.body.appendChild(bottomNav1);

  loaded.AGENT._internalForTest.processScreen(false);
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => origSetTimeout(r, 15));
    if (q2SubmitClicks >= 1 && !loaded.AGENT.getDiagnostics().isProcessing && !loaded.AGENT.getDiagnostics().isSelfAdvancing) {
      break;
    }
  }
  loaded.AGENT.cleanup();

  assert.strictEqual(q1SubmitClicks, 1, "TRẢ LỜI chỉ được bấm ĐÚNG 1 lần dù server phản hồi chậm 600ms");
  assert.strictEqual(decoyChevronClicks, 0, "Tuyệt đối không bấm nhầm nút icon .fa-chevron-right bẫy");
  assert.strictEqual(mathSpanClicks, 0, "Tuyệt đối không bấm nhầm các số toán học 2, 4, 6, 8");
  assert.strictEqual(q1ContinueClicks, 1, "TIẾP TỤC chỉ được bấm ĐÚNG 1 lần khi xuất hiện ở giây thứ 0.6");
  assert.deepStrictEqual(solvedQCodes, ["#13153797", "#13153798"], "Phải giải đúng thứ tự Câu 1 -> Câu 2");
  assert.strictEqual(q2SubmitClicks, 1, "Câu 2 chỉ giải xong mới bấm TRẢ LỜI");
});

test("42. Bấm TRẢ LỜI trên div (native click + boxShadow + đổi fingerprint nhẹ + hidden hotkey span + top=45) -> TIẾP TỤC sang Câu 2", async () => {
  const { doc, env } = createTestEnvironment({
    innerWidth: 390,
    innerHeight: 844,
    url: "https://app.onluyen.vn/practice/step-shadow"
  });
  const origSetTimeout = global.setTimeout;
  const solvedQuestions = [];
  let q1SubmitCount = 0;
  let q1ContCount = 0;
  let q2Selected = false;

  const loaded = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "solveQuiz") {
      solvedQuestions.push(args.rawScreenText);
      return { success: true, result: { normalizedAns: "B", confidence: 97 } };
    }
    return null;
  });
  loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.round(ms / 20)));
  loaded.AGENT._internalForTest.resetState();

  const renderQ2 = () => {
    doc.body.childNodes = [];
    const cards2 = ["A", "B", "C", "D"].map((L, i) => {
      const c = el(doc, "div", {
        className: "choice-box",
        cs: { cursor: "pointer", boxShadow: "none" },
        rect: { top: 180 + i * 54, left: 16, width: 350, height: 46 }
      }, [
        el(doc, "span", { text: `${L}. Q2-${L}`, rect: { top: 190 + i * 54, left: 26, width: 240, height: 22 } })
      ]);
      c.addEventListener("click", () => {
        if (L === "B") q2Selected = true;
        c.setComputedStyle({ boxShadow: "0 0 0 2px #1d4ed8" });
        loaded.AGENT.updateConfig({ autoAdvanceEnabled: false });
      });
      return c;
    });
    doc.body.appendChild(el(doc, "div", { rect: { top: 64, left: 10, width: 370, height: 400 } }, [
      el(doc, "p", { text: "Câu 2: Tính 5 + 5?" }),
      ...cards2
    ]));
  };

  const hintSpan = el(doc, "span", { text: "", rect: { top: 108, left: 16, width: 200, height: 20 } });
  const cards1 = ["A", "B", "C", "D"].map((L, i) => {
    const card = el(doc, "div", {
      className: "choice-box",
      cs: { cursor: "pointer", boxShadow: "none" },
      rect: { top: 180 + i * 54, left: 16, width: 350, height: 46 }
    }, [
      el(doc, "span", { text: `${L}. Đáp án ${L}`, rect: { top: 190 + i * 54, left: 28, width: 240, height: 22 } })
    ]);
    card.addEventListener("click", () => {
      cards1.forEach((x) => x.setComputedStyle({ boxShadow: "none" }));
      card.setComputedStyle({ boxShadow: "0 0 0 2px #1d4ed8" });
      // Làm lệch nhẹ stemText/fingerprint sau khi tích đáp án nhưng vẫn ở Câu 1
      hintSpan.textContent = "(Đã chọn đáp án)";
    });
    return card;
  });

  const q1Box = el(doc, "div", { rect: { top: 64, left: 10, width: 370, height: 460 } }, [
    el(doc, "p", { text: "Câu 1: Tìm nghiệm phương trình x + 1 = 3." }),
    hintSpan,
    ...cards1
  ]);

  const hiddenHotkey = el(doc, "span", { text: "Hotkey", style: { display: "none" }, rect: { top: 45, left: 100, width: 0, height: 0 } });
  const visibleLabel = el(doc, "span", { text: "TRẢ LỜI", rect: { top: 45, left: 150, width: 80, height: 22 } });
  const btnAnswer = el(doc, "div", {
    className: "btn-answer rounded-full",
    cs: { cursor: "pointer" },
    rect: { top: 45, left: 32, width: 326, height: 44 }
  }, [hiddenHotkey, visibleLabel]);
  btnAnswer._innerText = "TRẢ LỜI";
  visibleLabel._innerText = "TRẢ LỜI";
  btnAnswer.addEventListener("click", () => {
    q1SubmitCount += 1;
    btnAnswer.remove();
    const btnCont = el(doc, "div", {
      className: "btn-answer rounded-full",
      cs: { cursor: "pointer" },
      rect: { top: 45, left: 32, width: 326, height: 44 }
    }, [el(doc, "span", { text: "TIẾP TỤC", rect: { top: 45, left: 150, width: 90, height: 22 } })]);
    btnCont.addEventListener("click", () => {
      q1ContCount += 1;
      renderQ2();
    });
    doc.body.appendChild(btnCont);
  });

  doc.body.appendChild(q1Box);
  doc.body.appendChild(btnAnswer);

  loaded.AGENT._internalForTest.processScreen(false);
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => origSetTimeout(r, 15));
    if (q2Selected && !loaded.AGENT.getDiagnostics().isProcessing && !loaded.AGENT.getDiagnostics().isSelfAdvancing) break;
  }
  loaded.AGENT.cleanup();

  assert.strictEqual(q1SubmitCount, 1, "Phải bấm được TRẢ LỜI trên thẻ div dù fingerprint câu đổi nhẹ & top < 60");
  assert.ok(btnAnswer.clickCount >= 1 || visibleLabel.clickCount >= 1, "Phải gọi native .click() trên thẻ div/span");
  assert.strictEqual(q1ContCount, 1, "Phải bấm tiếp TIẾP TỤC để sang Câu 2");
  assert.strictEqual(q2Selected, true);
  assert.strictEqual(solvedQuestions.length, 2);
});

test("43. Câu hỏi đồ thị (<svg>): chống treo hoàn toàn khi requestAnimationFrame đơ và takeScreenshot không phản hồi", async () => {
  const { doc, env } = createTestEnvironment({ innerWidth: 390, innerHeight: 844 });
  const origSetTimeout = global.setTimeout;
  // Giả lập WebView treo requestAnimationFrame (không bao giờ gọi callback)
  env.requestAnimationFrame = () => 1;

  let solveCalledWithText = "";
  let submitClicks = 0;
  let stageSeenDuringCall = false;

  const loaded = loadModulesInEnv(env, async (handler, args) => {
    if (handler === "takeScreenshot") {
      if (doc.getElementById("__onluyen_capture_stage")) stageSeenDuringCall = true;
      // Giả lập Android takeScreenshot treo vô thời hạn
      return new Promise(() => {});
    }
    if (handler === "solveQuiz") {
      solveCalledWithText = args.rawScreenText || "";
      return { success: true, result: { normalizedAns: "B", confidence: 91 } };
    }
    return null;
  });
  loaded.sandbox.setTimeout = (fn, ms) => origSetTimeout(fn, Math.max(1, Math.min(80, Math.round(ms / 40))));
  loaded.AGENT._internalForTest.resetState();

  const graphSvg = el(doc, "svg", {
    width: 320,
    height: 200,
    rect: { top: 140, left: 20, width: 320, height: 200 }
  }, [
    el(doc, "path", { d: "M 10 180 Q 160 10 310 180" })
  ]);

  const opts = ["A", "B", "C", "D"].map((L, i) => {
    const b = el(doc, "button", {
      text: `${L}. y = x^2 - ${i}`,
      rect: { top: 360 + i * 48, left: 16, width: 340, height: 42 }
    });
    b.addEventListener("click", () => {
      opts.forEach((x) => x.setAttribute("class", ""));
      b.setAttribute("class", "selected");
    });
    return b;
  });

  const submitBtn = el(doc, "div", {
    className: "btn-submit",
    cs: { cursor: "pointer" },
    rect: { top: 620, left: 32, width: 326, height: 44 }
  }, [el(doc, "span", { text: "TRẢ LỜI", rect: { top: 630, left: 150, width: 90, height: 22 } })]);
  submitBtn.addEventListener("click", () => {
    submitClicks += 1;
    loaded.AGENT.updateConfig({ autoAdvanceEnabled: false });
  });

  doc.body.appendChild(el(doc, "div", { rect: { top: 80, left: 10, width: 370, height: 500 } }, [
    el(doc, "p", {}, ["Cho đồ thị hàm số như hình vẽ dưới đây:", graphSvg]),
    ...opts
  ]));
  doc.body.appendChild(submitBtn);

  // Kiểm tra trực tiếp prepareVisualAttachments không đơ và tự gỡ stage
  const cls = loaded.EXT.classifyQuestionInScope(doc, true);
  const payload = loaded.EXT.extractQuestionPayload(doc, cls);
  const directImgs = await loaded.AGENT._internalForTest.prepareVisualAttachments(payload, cls, false);
  assert.strictEqual(stageSeenDuringCall, true);
  assert.strictEqual(Array.isArray(directImgs), true);
  assert.strictEqual(doc.getElementById("__onluyen_capture_stage"), null, "Phải tự gỡ overlay kể cả khi takeScreenshot treo");

  // Kiểm tra luồng giải hoàn chỉnh trên câu đồ thị vẫn tích và bấm TRẢ LỜI trơn tru
  loaded.AGENT._internalForTest.processScreen(false);
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => origSetTimeout(r, 15));
    if (submitClicks >= 1 && !loaded.AGENT.getDiagnostics().isProcessing && !loaded.AGENT.getDiagnostics().isSelfAdvancing) break;
  }
  loaded.AGENT.cleanup();

  assert.strictEqual(doc.getElementById("__onluyen_capture_stage"), null, "Không bao giờ để sót overlay khóa màn hình");
  assert.ok(solveCalledWithText.includes("[HÌNH_ĐỒ_THỊ]"), "Vẫn phải gọi AI giải câu đồ thị thay vì kẹt");
  assert.strictEqual(loaded.EXT.detectUIAns("MCQ", cls.mcq, null, null), "B");
  assert.strictEqual(submitClicks, 1, "Phải bấm TRẢ LỜI sau khi giải xong câu đồ thị");
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
