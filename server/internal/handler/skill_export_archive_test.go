package handler

import (
	"archive/zip"
	"bytes"
	"testing"
)

func TestSanitizeArchiveEntryName(t *testing.T) {
	cases := map[string]string{
		"review-helper":       "review-helper",
		"my/weird\\name":      "my-weird-name",
		"  padded  ":          "padded",
		"trailing.":           "trailing",
		"has\x00control\x1f!": "hascontrol!",
	}
	for in, want := range cases {
		if got := sanitizeArchiveEntryName(in); got != want {
			t.Errorf("sanitizeArchiveEntryName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestUniqueArchiveFolderName(t *testing.T) {
	used := map[string]int{}
	first := uniqueArchiveFolderName(used, "Review Helper")
	second := uniqueArchiveFolderName(used, "Review Helper")
	third := uniqueArchiveFolderName(used, "Review Helper")
	if first == second || second == third || first == third {
		t.Fatalf("collisions must be disambiguated, got %q, %q, %q", first, second, third)
	}
	if got := uniqueArchiveFolderName(used, ""); got != "untitled" {
		t.Errorf("empty name = %q, want %q", got, "untitled")
	}
}

func TestWriteZipTextEntryAndResponse(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	if err := writeZipTextEntry(zw, "review-helper/SKILL.md", "# hello"); err != nil {
		t.Fatalf("writeZipTextEntry: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}

	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("read back zip: %v", err)
	}
	if len(zr.File) != 1 || zr.File[0].Name != "review-helper/SKILL.md" {
		t.Fatalf("unexpected zip contents: %+v", zr.File)
	}
	rc, err := zr.File[0].Open()
	if err != nil {
		t.Fatalf("open entry: %v", err)
	}
	defer rc.Close()
	var out bytes.Buffer
	if _, err := out.ReadFrom(rc); err != nil {
		t.Fatalf("read entry: %v", err)
	}
	if out.String() != "# hello" {
		t.Errorf("entry content = %q, want %q", out.String(), "# hello")
	}
}
