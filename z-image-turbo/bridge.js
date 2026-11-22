// Local AI Studio 연동용 브리지 (이 파일만 추가된 코드, 나머지는 공식 데모 그대로)
// Studio(부모 창)가 이 페이지를 화면 밖 iframe으로 열고 명령을 보내면,
// 공식 화면의 버튼·입력칸을 대신 조작하고 진행 상태와 결과 이미지를 부모에게 돌려준다.
const $ = s => document.querySelector(s);
const post = m => parent.postMessage({ lais: 1, ...m }, location.origin);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

if (parent !== window) {
    let lastErr = "";
    const origErr = console.error;
    console.error = (...a) => {
        lastErr = a.map(x => (x && x.message) || String(x)).join(" ").slice(0, 300);
        origErr.apply(console, a);
    };
    window.addEventListener("error", e => {
        if (/ResizeObserver/.test(e.message || "")) return; // 무해한 브라우저 경고
        post({ t: "err", msg: e.message || "페이지 오류" });
    });
    window.addEventListener("unhandledrejection", e => post({ t: "err", msg: String((e.reason && e.reason.message) || e.reason) }));

    const loadPct = () => {
        const v = parseFloat(($(".loadwave-data strong") || {}).textContent);
        return isNaN(v) ? 0 : v;
    };

    async function doLoad(d) {
        const res = $("#resolution-select");
        if (d.res && res) {
            res.value = String(d.res);
            fire(res, "change");
        }
        // 공식 페이지가 ONNX Runtime을 불러와 버튼을 활성화할 때까지 대기
        for (let i = 0; i < 300 && $("#load").disabled; i++) await sleep(200);
        if ($("#load").disabled) return post({ t: "err", msg: lastErr || "모델 불러오기 버튼이 활성화되지 않았습니다 (WebGPU/브라우저 확인)" });
        lastErr = "";
        $("#load").click();
        let last = -1,
            lastChange = Date.now();
        for (;;) {
            await sleep(400);
            if ($("#buttons").classList.contains("loaded")) return post({ t: "loaded" });
            const p = loadPct();
            if (p !== last) {
                last = p;
                lastChange = Date.now();
                post({ t: "p", pct: p });
            }
            // 오류가 기록됐는데 진행이 멈췄다면 실패로 판단
            if (lastErr && Date.now() - lastChange > 8000) return post({ t: "err", msg: lastErr });
        }
    }

    async function doGen(d) {
        $("#user-input").value = d.prompt;
        fire($("#user-input"), "input");
        const steps = $("#steps-input");
        if (d.steps && steps) {
            steps.value = String(d.steps);
            fire(steps, "change");
        }
        $("#random-seed").click();
        lastErr = "";
        const img = $("#img_div");
        $("#generate").click();
        const t0 = Date.now();
        let started = false;
        for (;;) {
            await sleep(300);
            const cls = img.className;
            if (!/\bdone\b/.test(cls)) started = true;
            if (started && /\bdone\b/.test(cls)) {
                const nsfw = /\bnsfw\b/.test(cls);
                const blob = await new Promise(r => $("#img_canvas").toBlob(r, "image/png"));
                return post({ t: "img", blob, nsfw });
            }
            if (lastErr && !$("#generate").disabled && Date.now() - t0 > 2000) return post({ t: "err", msg: lastErr });
        }
    }

    window.addEventListener("message", e => {
        if (e.origin !== location.origin || !e.data || !e.data.lais) return;
        const d = e.data;
        (d.t === "load" ? doLoad(d) : d.t === "gen" ? doGen(d) : Promise.resolve()).catch(x => post({ t: "err", msg: String((x && x.message) || x) }));
    });
    post({ t: "hello" });
}
