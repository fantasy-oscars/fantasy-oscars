#!/usr/bin/env python3
"""Minimal in-memory stand-in for the GitHub REST endpoints the ops scripts use.

Usage: fake_github.py PORT STATE_JSON
Handles issues (list/create/patch/comment), labels, and the contents API for one repo.
Every request is appended to STATE_JSON's "requests" list so tests can assert on it.
"""
import base64
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

state = {"issues": [], "comments": [], "files": {}, "labels": [], "requests": []}
STATE_PATH = sys.argv[2]


def save():
    with open(STATE_PATH, "w") as fh:
        json.dump(state, fh, indent=1)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def handle_any(self, method):
        url = urlparse(self.path)
        parts = url.path.strip("/").split("/")  # repos/o/r/...
        if parts[0] == "__admin":  # test hooks: /__admin/close/N, /__admin/delete/N
            num = int(parts[2])
            if parts[1] == "close":
                next(i for i in state["issues"] if i["number"] == num)["state"] = "closed"
            else:
                state["issues"] = [i for i in state["issues"] if i["number"] != num]
            save()
            return self.reply(200, {"ok": True})
        rest = "/" + "/".join(parts[3:])
        payload = self.body() if method in ("POST", "PUT", "PATCH") else {}
        state["requests"].append({"method": method, "path": rest, "auth": self.headers.get("Authorization")})
        if self.headers.get("Authorization") != "Bearer testtoken":
            return self.reply(401, {"message": "bad credentials"})
        if rest == "/labels" and method == "POST":
            if payload["name"] in state["labels"]:
                return self.reply(422, {"message": "already_exists"})
            state["labels"].append(payload["name"])
            save()
            return self.reply(201, payload)
        if rest == "/issues" and method == "GET":
            want = parse_qs(url.query).get("labels", [""])[0]
            out = [i for i in state["issues"] if i["state"] == "open" and want in i["labels"]]
            return self.reply(200, out)
        if rest == "/issues" and method == "POST":
            issue = {"number": len(state["issues"]) + 1, "title": payload["title"], "body": payload["body"],
                     "labels": payload.get("labels", []), "state": "open"}
            state["issues"].append(issue)
            save()
            return self.reply(201, issue)
        if rest.startswith("/issues/"):
            num = int(rest.split("/")[2])
            issue = next((i for i in state["issues"] if i["number"] == num), None)
            if issue is None:
                return self.reply(404, {"message": "Not Found"})
            if method == "GET":
                return self.reply(200, issue)
            if rest.endswith("/comments") and method == "POST":
                state["comments"].append({"issue": num, "body": payload["body"]})
                save()
                return self.reply(201, {"id": len(state["comments"])})
            if method == "PATCH":
                issue.update({k: v for k, v in payload.items() if k == "state"})
                save()
                return self.reply(200, issue)
        if rest.startswith("/contents/"):
            path = rest[len("/contents/"):]
            if method == "GET":
                if path not in state["files"]:
                    return self.reply(404, {"message": "Not Found"})
                return self.reply(200, {"sha": state["files"][path]["sha"]})
            if method == "PUT":
                existing = state["files"].get(path)
                if existing and payload.get("sha") != existing["sha"]:
                    return self.reply(409, {"message": "sha mismatch"})
                n = (existing["n"] + 1) if existing else 1
                state["files"][path] = {"sha": f"sha{n}", "n": n,
                                        "content": base64.b64decode(payload["content"]).decode()}
                save()
                return self.reply(200, {"ok": True})
        return self.reply(404, {"message": "unhandled " + method + " " + rest})

    def do_GET(self):
        self.handle_any("GET")

    def do_POST(self):
        self.handle_any("POST")

    def do_PUT(self):
        self.handle_any("PUT")

    def do_PATCH(self):
        self.handle_any("PATCH")


save()
HTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
