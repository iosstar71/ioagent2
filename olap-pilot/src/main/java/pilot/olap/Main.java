package pilot.olap;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.Reader;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * 파일럿 실행 진입점. JDK 내장 HTTP 서버로 API와 정적 화면을 함께 서비스한다.
 * 운영에서는 이 클래스 대신 기존 Java 서버의 컨트롤러가 PivotService를 호출하면 된다.
 *
 * 실행: java -jar olap-pilot.jar [포트] [DuckDB 파일 경로]
 */
public final class Main {

    private static final Gson GSON = new GsonBuilder().serializeNulls().create();

    private static final Map<String, String> CONTENT_TYPES = Map.of(
            "html", "text/html; charset=utf-8",
            "js", "text/javascript; charset=utf-8",
            "css", "text/css; charset=utf-8");

    private interface Handler {
        Object handle(HttpExchange ex) throws Exception;
    }

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8080;
        Path dbFile = Paths.get(args.length > 1 ? args[1] : "data/pilot.duckdb").toAbsolutePath();
        if (dbFile.getParent() != null) {
            Files.createDirectories(dbFile.getParent());
        }
        String url = "jdbc:duckdb:" + dbFile;

        // DuckDB는 같은 프로세스 안에서만 한 파일을 여러 연결로 쓸 수 있다.
        // 그래서 기준 연결 하나를 열어 두고 요청마다 그 연결을 복제해 쓴다.
        Connection root = DriverManager.getConnection(url);
        SampleData.ensure(root);
        org.duckdb.DuckDBConnection duck = root.unwrap(org.duckdb.DuckDBConnection.class);

        Meta meta = Meta.loadFromClasspath("/pivot-meta.json");
        PivotService service = new PivotService(meta, SqlDialect.DUCKDB, duck::duplicate);

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.createContext("/api/meta", json(ex -> meta));
        server.createContext("/api/members", json(ex -> service.members(queryParam(ex, "dim"))));
        server.createContext("/api/pivot", json(ex -> service.pivot(readBody(ex))));
        server.createContext("/api/detail", json(ex -> service.detail(readBody(ex))));
        server.createContext("/", Main::serveStatic);
        server.start();
        // 콘솔 인코딩에 따라 한글이 깨질 수 있어 시작 메시지는 영문으로 둔다.
        System.out.println("OLAP pilot started: http://localhost:" + port + "  (DB: " + dbFile + ")");
    }

    private static com.sun.net.httpserver.HttpHandler json(Handler h) {
        return ex -> {
            int status = 200;
            Object body;
            try {
                body = h.handle(ex);
            } catch (IllegalArgumentException | JsonParseException e) {
                status = 400;
                body = error(e.getMessage());
            } catch (SQLException e) {
                e.printStackTrace();
                status = 500;
                body = error("조회 중 오류가 발생했습니다: " + e.getMessage());
            } catch (Exception e) {
                e.printStackTrace();
                status = 500;
                body = error("서버 오류가 발생했습니다.");
            }
            send(ex, status, "application/json; charset=utf-8",
                    GSON.toJson(body).getBytes(StandardCharsets.UTF_8));
        };
    }

    private static Map<String, Object> error(String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", message);
        return m;
    }

    private static PivotRequest readBody(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) {
            throw new IllegalArgumentException("POST로 요청해야 합니다.");
        }
        try (Reader r = new InputStreamReader(ex.getRequestBody(), StandardCharsets.UTF_8)) {
            PivotRequest req = GSON.fromJson(r, PivotRequest.class);
            if (req == null) {
                throw new IllegalArgumentException("요청 본문이 비어 있습니다.");
            }
            return req;
        }
    }

    private static String queryParam(HttpExchange ex, String name) {
        String q = ex.getRequestURI().getQuery();
        if (q != null) {
            for (String pair : q.split("&")) {
                int eq = pair.indexOf('=');
                if (eq > 0 && pair.substring(0, eq).equals(name)) {
                    return pair.substring(eq + 1);
                }
            }
        }
        throw new IllegalArgumentException("필수 파라미터 누락: " + name);
    }

    private static void serveStatic(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        if (path.equals("/")) {
            path = "/index.html";
        }
        String ext = path.substring(path.lastIndexOf('.') + 1);
        String type = CONTENT_TYPES.get(ext);
        // 하위 경로 없이 web/ 바로 아래 파일만 허용한다.
        if (type == null || !path.matches("/[A-Za-z0-9_.-]+")) {
            send(ex, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        try (InputStream in = Main.class.getResourceAsStream("/web" + path)) {
            if (in == null) {
                send(ex, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8));
                return;
            }
            send(ex, 200, type, in.readAllBytes());
        }
    }

    private static void send(HttpExchange ex, int status, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, body.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(body);
        }
    }
}
