"use strict";
if (new URLSearchParams(location.search).get("demo") === "glass") {
  location.replace("/effects-playground/glass/" + location.hash);
}
