// pages/upload-files.tsx
import { useState, useRef, useEffect } from 'react';
import {
  TextField,
  Button,
  IconButton,
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import { Remove, Add, Delete, Folder, InsertDriveFile } from '@mui/icons-material';
import axios, { isAxiosError } from 'axios'; // Import isAxiosError
import { v4 as uuidv4 } from 'uuid';

interface DirectoryInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  webkitdirectory?: string;
}

interface SelectedItem {
  path: string;
  files: File[];
  isDirectory: boolean;
}

interface Label {
  key: string;
  value: string;
}

interface ProgressData {
  totalFiles: number;
  processedFiles: number;
  processingFiles: string[];
  isComplete: boolean;
}

const UploadFiles = () => {
  const [collectionName, setCollectionName] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirectorySupported, setIsDirectorySupported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [progressData, setProgressData] = useState<ProgressData>({
    totalFiles: 0,
    processedFiles: 0,
    processingFiles: [],
    isComplete: false,
  });
  const startTimeRef = useRef<Date | null>(null); // Changed from state to ref
  const [totalTime, setTotalTime] = useState<string>('');

  useEffect(() => {
    // Check if the browser supports the `webkitdirectory` attribute.
    const testInput = document.createElement('input');
    testInput.type = 'file';
    if ('webkitdirectory' in testInput) {
      setIsDirectorySupported(true);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const newItems: SelectedItem[] = filesArray.map((file) => ({
        path: file.name,
        files: [file],
        isDirectory: false,
      }));
      setSelectedItems((prev) => [...prev, ...newItems]);
    }
  };

  const handleDirectoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const directoriesMap: { [key: string]: File[] } = {};

      filesArray.forEach((file) => {
        const pathParts = file.webkitRelativePath.split('/');
        const isDirectory = pathParts.length > 1;
        const directoryPath = isDirectory ? pathParts.slice(0, -1).join('/') : '';

        if (directoryPath) {
          if (!directoriesMap[directoryPath]) {
            directoriesMap[directoryPath] = [];
          }
          directoriesMap[directoryPath].push(file);
        }
      });

      // Add directories to the selectedItems state
      const newSelectedItems: SelectedItem[] = Object.keys(directoriesMap).map((directoryPath) => ({
        path: directoryPath,
        files: directoriesMap[directoryPath],
        isDirectory: true,
      }));

      setSelectedItems((prev) => [...prev, ...newSelectedItems]);
    }
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const handleLabelChange = (index: number, key: string, value: string) => {
    const newLabels = [...labels];
    newLabels[index] = { key, value };
    setLabels(newLabels);
  };

  const addLabel = () => {
    setLabels([...labels, { key: '', value: '' }]);
  };

  const removeLabel = (index: number) => {
    setLabels(labels.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionName) {
      alert('Please provide a collection name.');
      return;
    }
    if (selectedItems.length === 0) {
      alert('Please select at least one file or directory.');
      return;
    }

    // Prepare all files for upload
    const allFiles: { file: File; relativePath: string }[] = [];
    selectedItems.forEach((item) => {
      item.files.forEach((file) => {
        const relativePath = item.isDirectory ? `${item.path}/${file.name}` : file.name;
        allFiles.push({ file, relativePath });
      });
    });

    const totalFiles = allFiles.length;
    const generatedUploadId = uuidv4();
    setProgressData({
      totalFiles,
      processedFiles: 0,
      processingFiles: [],
      isComplete: false,
    });
    setIsModalOpen(true);
    setIsSubmitting(true);
    startTimeRef.current = new Date();

    const formData = new FormData();
    formData.append('collectionName', collectionName);
    formData.append('labels', JSON.stringify(labels));
    formData.append('uploadId', generatedUploadId);
    console.log('Frontend Generated Upload ID:', generatedUploadId);

    allFiles.forEach((item) => {
      formData.append('files', item.file, item.relativePath);
    });

    try {
      // Use Axios with typed response
      const uploadResponse = await axios.post<{ success: boolean; message: string; uploadId: string }>(
        '/api/upload-files',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      console.log('Upload response:', uploadResponse.data);

      // Extract uploadId from response to ensure consistency
      const responseUploadId = uploadResponse.data.uploadId;
      console.log('Upload ID from backend:', responseUploadId);

      // Start polling for processing progress
      const pollingInterval = setInterval(async () => {
        if (!responseUploadId) {
          console.error('No uploadId available for polling.');
          clearInterval(pollingInterval);
          setIsSubmitting(false);
          return;
        }

        try {
          const progressResponse = await axios.get<ProgressData>(
            `/api/upload-progress?uploadId=${responseUploadId}`
          );
          const data: ProgressData = progressResponse.data;

          console.log('Progress data:', data);

          setProgressData(data);

          if (data.isComplete) {
            // All files have been processed
            clearInterval(pollingInterval);
            const endTime = new Date();
            const timeDiff = (endTime.getTime() - (startTimeRef.current?.getTime() || endTime.getTime())) / 1000;
            const minutes = Math.floor(timeDiff / 60);
            const seconds = Math.floor(timeDiff % 60);
            setTotalTime(`${minutes}m ${seconds}s`);
            setIsSubmitting(false);
          }
        } catch (error: unknown) {
          if (isAxiosError(error) && error.response?.status === 404) {
            // Progress data not found, possibly completed and cleaned up
            console.log('Progress data not found. Possibly completed.');
            clearInterval(pollingInterval);
            setIsSubmitting(false);
            setTotalTime('Completed');
            alert('File processing is complete.');
          } else {
            console.error('Error fetching progress:', error);
            clearInterval(pollingInterval);
            setIsSubmitting(false);
            alert('An error occurred while fetching progress.');
          }
        }
      }, 1000); // Poll every second
    } catch (error: unknown) {
      console.error('Error uploading files:', error);
      alert('An error occurred while uploading files.');
      setIsSubmitting(false);
      setIsModalOpen(false);
    }
  };

  const resetForm = () => {
    setCollectionName('');
    setSelectedItems([]);
    setLabels([]);
    setIsSubmitting(false);
    setTotalTime('');
    setProgressData({
      totalFiles: 0,
      processedFiles: 0,
      processingFiles: [],
      isComplete: false,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (directoryInputRef.current) {
      directoryInputRef.current.value = '';
    }
  };

  // Compute remainingFiles dynamically
  const remainingFiles =
    progressData.totalFiles -
    progressData.processedFiles -
    progressData.processingFiles.length;

  // Sort selected items so that directories appear first
  const sortedItems = [...selectedItems].sort((a, b) =>
    a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1
  );

  return (
    <>
      <Paper elevation={3} sx={{ p: 4, maxWidth: 600, mx: 'auto', mt: 4 }}>
        <form onSubmit={handleSubmit}>
          <Typography variant="h6" gutterBottom>
            Upload Files or Directories
          </Typography>

          <TextField
            label="Collection Name"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            required
            disabled={isSubmitting}
            fullWidth
            margin="normal"
          />

          <Box display="flex" gap={2} mb={2}>
            <Button
              variant="contained"
              component="label"
              disabled={isSubmitting}
              sx={{ flex: 1 }}
            >
              Add Files
              <input
                type="file"
                hidden
                multiple
                onChange={handleFileChange}
                ref={fileInputRef}
              />
            </Button>

            {isDirectorySupported && (
              <Button
                variant="contained"
                component="label"
                disabled={isSubmitting}
                sx={{ flex: 1 }}
              >
                Add Directory
                <input
                  type="file"
                  hidden
                  multiple
                  ref={directoryInputRef}
                  // Apply `webkitdirectory` using a cast to `any` to avoid TypeScript errors.
                  onChange={handleDirectoryChange}
                  {...({ webkitdirectory: 'true' } as DirectoryInputProps)}
                />
              </Button>
            )}
          </Box>

          {sortedItems.length > 0 && (
            <List dense>
              {sortedItems.map((item, index) => (
                <ListItem key={index}>
                  <Box display="flex" alignItems="center" gap={1} width="100%">
                    {item.isDirectory ? <Folder /> : <InsertDriveFile />}
                    <ListItemText
                      primary={item.path}
                      secondary={item.isDirectory ? `${item.files.length} file(s)` : undefined}
                      sx={{ flexGrow: 1 }}
                    />
                    <IconButton
                      edge="end"
                      aria-label="remove"
                      onClick={() => handleRemoveItem(index)}
                    >
                      <Delete />
                    </IconButton>
                  </Box>
                </ListItem>
              ))}
            </List>
          )}

          <Typography variant="subtitle1" gutterBottom>
            Labels:
          </Typography>
          {labels.map((label, index) => (
            <Box key={index} display="flex" alignItems="center" gap={2} mb={1}>
              <IconButton
                onClick={() => removeLabel(index)}
                disabled={isSubmitting}
                aria-label="Remove Label"
              >
                <Remove />
              </IconButton>
              <TextField
                label="Label Name"
                value={label.key}
                onChange={(e) => handleLabelChange(index, e.target.value, label.value)}
                disabled={isSubmitting}
                fullWidth
              />
              <TextField
                label="Label Value"
                value={label.value}
                onChange={(e) => handleLabelChange(index, label.key, e.target.value)}
                disabled={isSubmitting}
                fullWidth
              />
            </Box>
          ))}

          <Button
            variant="outlined"
            onClick={addLabel}
            disabled={isSubmitting}
            startIcon={<Add />}
            sx={{ mb: 2 }}
          >
            Add Label
          </Button>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isSubmitting}
            fullWidth
          >
            {isSubmitting ? 'Uploading...' : 'Upload'}
          </Button>
        </form>
      </Paper>

      {/* Progress Modal */}
      <Dialog open={isModalOpen} onClose={() => {}} disableEscapeKeyDown>
        <DialogTitle>Uploading and Processing Files</DialogTitle>
        <DialogContent dividers>
          <Box mb={2}>
            <Typography variant="body1">
              Total Files: {progressData.totalFiles}
            </Typography>
            <Typography variant="body1">
              Processed Files: {progressData.processedFiles}
            </Typography>
            <Typography variant="body1">
              Currently Processing: {progressData.processingFiles.length}
            </Typography>
            <Typography variant="body1">
              Remaining Files: {remainingFiles >= 0 ? remainingFiles : 0}
            </Typography>
          </Box>
          <Box mb={2}>
            <LinearProgress
              variant="determinate"
              value={
                progressData.totalFiles > 0
                  ? (progressData.processedFiles / progressData.totalFiles) * 100
                  : 0
              }
            />
          </Box>
          <Box>
            <Typography variant="subtitle1">Files Being Processed:</Typography>
            {progressData.processingFiles.length > 0 ? (
              <List dense>
                {progressData.processingFiles.map((filename, index) => (
                  <ListItem key={index}>
                    <InsertDriveFile sx={{ mr: 1 }} />
                    <ListItemText primary={filename} />
                    <CircularProgress size={20} />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2">No files are currently being processed.</Typography>
            )}
          </Box>
          {totalTime && (
            <Box mt={2}>
              <Typography variant="h6">
                Processing Completed in {totalTime}
              </Typography>
            </Box>
          )}
        </DialogContent>
        {totalTime && (
          <DialogActions>
            <Button
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              color="primary"
              variant="contained"
            >
              OK
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </>
  );
};

export default UploadFiles;
