import type express from "express";

export type AuthCookieConfig = {
  name: string;
  sameSite: "lax" | "none";
  httpOnly: boolean;
  secure: boolean;
  path: "/";
};

export function registerAuthLogoutRoute(args: {
  router: express.Router;
  cookieConfig: AuthCookieConfig;
}) {
  const { router, cookieConfig } = args;

  router.post("/logout", (_req, res) => {
    res
      .clearCookie(cookieConfig.name, {
        httpOnly: cookieConfig.httpOnly,
        sameSite: cookieConfig.sameSite,
        secure: cookieConfig.secure,
        path: cookieConfig.path
      })
      .status(204)
      .end();
  });
}
